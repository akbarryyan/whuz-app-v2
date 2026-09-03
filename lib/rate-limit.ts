/**
 * Pembatas laju permintaan.
 *
 * Penyimpanannya IN-MEMORY dan sengaja demikian: aplikasi ini dijalankan PM2
 * dalam `exec_mode: "fork"` dengan `instances: 1` (lihat ecosystem.config.js),
 * jadi hanya ada satu proses yang melayani permintaan dan satu Map sudah cukup.
 * Redis tidak dipakai — REDIS_URL bahkan masih dikomentari di blok env PM2.
 *
 * KALAU NANTI PINDAH KE CLUSTER MODE, pembatas ini harus pindah ke Redis.
 * Dengan N instance, setiap instance punya hitungannya sendiri dan batas
 * efektifnya menjadi N kali lipat. Batasan yang sama sudah dicatat untuk
 * penulisan berkas log di lib/logger.ts.
 *
 * Algoritmanya jendela tetap (fixed window), bukan sliding: pemanggil bisa
 * mengirim `limit` permintaan di akhir satu jendela dan `limit` lagi di awal
 * jendela berikutnya. Untuk menahan penyalahgunaan dan penyisiran, ketelitian
 * itu sudah memadai, dan biayanya jauh lebih murah daripada sliding window.
 */

export interface RateLimitOptions {
  /** Jumlah permintaan yang diizinkan dalam satu jendela. */
  limit: number;
  /** Panjang jendela dalam milidetik. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Sisa jatah di jendela berjalan. */
  remaining: number;
  /** Detik sampai jendela berikutnya, untuk header Retry-After. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Disimpan di globalThis supaya hot reload di mode dev tidak mengosongkan
 * hitungan setiap kali modul dimuat ulang — pola yang sama dipakai
 * src/infra/db/prisma.ts dan src/infra/queue/bullmq/queue.ts.
 */
const g = globalThis as unknown as { _rateLimitBuckets?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g._rateLimitBuckets ??= new Map());

/** Batas atas jumlah kunci, sebagai pagar terhadap kebocoran memori. */
const MAX_KEYS = 50_000;
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Kalau setelah penyapuan masih membengkak, buang yang paling cepat
  // kedaluwarsa. Lebih baik melonggarkan batas daripada menghabiskan memori.
  if (buckets.size > MAX_KEYS) {
    const urut = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of urut.slice(0, buckets.size - MAX_KEYS)) buckets.delete(key);
  }
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= opts.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true, remaining: opts.limit - bucket.count, retryAfterSeconds: 0 };
}

/**
 * Alamat IP pemanggil.
 *
 * Aplikasi berjalan di belakang reverse proxy, jadi `x-real-ip` — yang biasanya
 * disetel nginx dari $remote_addr dan tidak bisa dipalsukan klien — dipakai
 * lebih dulu. Bila tidak ada, dipakai entri PERTAMA dari `x-forwarded-for`,
 * mengikuti cara yang sudah dipakai app/api/webhook/vip/route.ts.
 *
 * Perlu diketahui: tanpa `x-real-ip`, header ini dikirim klien dan bisa
 * dipalsukan. Pembatas berbasis IP karena itu menahan penyalahgunaan biasa,
 * bukan penyerang yang benar-benar berusaha.
 */
export function clientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || "unknown";
}

/** Hanya untuk test — mengosongkan seluruh hitungan. */
export function resetRateLimitStore() {
  buckets.clear();
  lastSweep = 0;
}

// ── Pemakaian di route handler ───────────────────────────────────────────────

/**
 * Pola pemakaian, mengikuti bentuk `requireAdmin` di lib/admin-auth.ts:
 *
 *     const limited = enforceRateLimit(request, "login", { limit: 10, windowMs: 5 * 60_000 });
 *     if (limited) return limited;
 *
 * `scope` memisahkan hitungan antar-endpoint supaya percobaan login tidak
 * memakan jatah checkout. `subject` opsional untuk membatasi per sasaran
 * (mis. per nomor tujuan OTP) selain per IP.
 */
export function enforceRateLimit(
  req: Request,
  scope: string,
  opts: RateLimitOptions,
  subject?: string,
): Response | null {
  const key = `${scope}:${subject ?? clientIp(req)}`;
  const hasil = rateLimit(key, opts);
  if (hasil.ok) return null;

  return Response.json(
    {
      success: false,
      error: "Terlalu banyak permintaan. Coba lagi sebentar lagi.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(hasil.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}
