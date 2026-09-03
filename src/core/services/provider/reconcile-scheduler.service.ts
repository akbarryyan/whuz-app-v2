/**
 * Penjadwalan rekonsiliasi order.
 *
 * Versi sebelumnya menyimpan jadwal di dalam memori proses:
 *
 *     const timer = setTimeout(..., delayMs);
 *     g._orderReconcileTimers?.set(orderId, timer);
 *
 * Jadwal seperti itu hilang setiap kali proses berhenti — deploy, restart PM2,
 * atau crash. Order yang menunggu rekonsiliasi tidak pernah ditengok lagi, dan
 * tidak ada jejak apa pun bahwa ia pernah dijadwalkan.
 *
 * Sekarang jadwalnya tidak disimpan di mana-mana. Sebuah sapuan berkala
 * menanyakan ulang ke database order mana yang tersangkut, sehingga keadaan
 * sesungguhnya selalu diturunkan dari data, bukan dari memori. Restart tidak
 * menghilangkan apa pun: sapuan berikutnya menemukan order yang sama.
 *
 * Ini juga menggantikan worker BullMQ yang dihapus. Worker itu berjalan di PM2
 * tanpa ada satu pun pengirim job, dan blok env-nya tidak memuat DATABASE_URL,
 * sehingga ia akan gagal andai benar-benar diberi pekerjaan.
 */
import { randomUUID } from "node:crypto";
import { OrderStatus } from "@/src/core/domain/enums/order.enum";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";
import { ReconcileOrderService } from "./reconcile-order.service";
import { getLogger } from "@/lib/logger";
import { runWithContext } from "@/lib/request-context";

const log = getLogger("provider");

function angka(nilai: string | undefined, bawaan: number): number {
  const n = Number(nilai);
  return Number.isFinite(n) && n > 0 ? n : bawaan;
}

/** Jeda antar sapuan. */
const INTERVAL_MS = angka(process.env.RECONCILE_SWEEP_INTERVAL_MS, 60_000);

/**
 * Umur minimal sebuah order sebelum dianggap tersangkut. Jangan terlalu pendek:
 * order yang baru saja dibayar memang sedang diproses, dan menyapu terlalu dini
 * berarti menembak provider untuk pekerjaan yang sedang berjalan.
 */
const STALE_MINUTES = angka(process.env.RECONCILE_SWEEP_STALE_MINUTES, 2);

/** Batas order per sapuan, supaya satu tumpukan besar tidak membanjiri provider. */
const BATCH = angka(process.env.RECONCILE_SWEEP_BATCH, 25);

/**
 * Satu sapuan: cari order tersangkut di database, rekonsiliasi satu per satu.
 *
 * Sengaja berurutan, bukan paralel — tiap rekonsiliasi memanggil API provider,
 * dan tidak ada gunanya menembakkan dua puluh lima panggilan sekaligus.
 */
export async function sweepStuckOrders(): Promise<{ processed: number; errors: number }> {
  const orderRepo = new OrderRepository();
  const reconcileService = new ReconcileOrderService(orderRepo);

  const tersangkut = await orderRepo.findPendingProviderOrders(STALE_MINUTES, BATCH);
  if (tersangkut.length === 0) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;

  for (const order of tersangkut) {
    try {
      await reconcileService.reconcile(order.id);
      processed++;
    } catch (err) {
      log.error({ err, orderId: order.id }, "sapuan rekonsiliasi gagal untuk satu order");
      errors++;
    }
  }

  log.info({ processed, errors, ditemukan: tersangkut.length }, "sapuan rekonsiliasi selesai");
  return { processed, errors };
}

/**
 * Disimpan di globalThis supaya hot reload di mode dev tidak menumpuk interval —
 * pola yang sama dipakai src/infra/db/prisma.ts.
 */
const g = globalThis as unknown as {
  _reconcileSweepTimer?: ReturnType<typeof setInterval>;
  _reconcileSweepRunning?: boolean;
};

/** Nyalakan sapuan berkala. Aman dipanggil lebih dari sekali. */
export function startReconcileSweep(): void {
  if (g._reconcileSweepTimer) return;

  if (process.env.RECONCILE_SWEEP_ENABLED === "false") {
    log.info("sapuan rekonsiliasi dimatikan lewat RECONCILE_SWEEP_ENABLED=false");
    return;
  }

  const timer = setInterval(() => {
    // Sapuan sebelumnya bisa saja masih berjalan kalau providernya lambat.
    // Menumpuknya hanya akan memperparah keadaan.
    if (g._reconcileSweepRunning) return;
    g._reconcileSweepRunning = true;

    // Sapuan berjalan di luar request HTTP, jadi tidak ada requestId ambien.
    // Correlation id sendiri supaya seluruh log satu sapuan bisa dirunut.
    void runWithContext({ requestId: randomUUID() }, () =>
      sweepStuckOrders()
        .catch((err) => log.error({ err }, "sapuan rekonsiliasi gagal"))
        .finally(() => {
          g._reconcileSweepRunning = false;
        }),
    );
  }, INTERVAL_MS);

  // Jangan menahan proses tetap hidup hanya karena interval ini.
  timer.unref?.();
  g._reconcileSweepTimer = timer;

  log.info(
    { intervalMs: INTERVAL_MS, staleMinutes: STALE_MINUTES, batch: BATCH },
    "sapuan rekonsiliasi dinyalakan",
  );
}

export function stopReconcileSweep(): void {
  if (!g._reconcileSweepTimer) return;
  clearInterval(g._reconcileSweepTimer);
  g._reconcileSweepTimer = undefined;
}

/**
 * Rekonsiliasi seketika untuk satu order, dipakai saat halaman pesanan dibuka.
 * Tidak lagi menjadwalkan percobaan lanjutan sendiri: kalau order masih
 * tersangkut, sapuan berkala yang akan menemukannya.
 */
export async function autoReconcileOrderNow(orderId: string) {
  const orderRepo = new OrderRepository();
  const order = await orderRepo.findById(orderId);
  if (!order) return null;

  if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PROCESSING_PROVIDER) {
    return order;
  }

  const reconcileService = new ReconcileOrderService(orderRepo);
  try {
    await reconcileService.reconcile(orderId);
  } catch (error) {
    log.error({ err: error, orderId }, "rekonsiliasi seketika gagal");
  }

  return orderRepo.findById(orderId);
}
