/**
 * Pembatas laju. Murni in-memory, jadi tidak butuh database.
 */
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { rateLimit, clientIp, enforceRateLimit, resetRateLimitStore } from "@/lib/rate-limit";

beforeEach(() => resetRateLimitStore());
afterEach(() => vi.useRealTimers());

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/uji", { headers });

describe("hitungan jendela", () => {
  it("mengizinkan tepat sebanyak limit, lalu menolak", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(rateLimit("a", opts).ok).toBe(true);
    expect(rateLimit("a", opts).ok).toBe(true);
    expect(rateLimit("a", opts).ok).toBe(true);
    expect(rateLimit("a", opts).ok).toBe(false);
  });

  it("sisa jatah dilaporkan menurun", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(rateLimit("b", opts).remaining).toBe(2);
    expect(rateLimit("b", opts).remaining).toBe(1);
    expect(rateLimit("b", opts).remaining).toBe(0);
  });

  it("kunci berbeda dihitung terpisah", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit("x", opts).ok).toBe(true);
    expect(rateLimit("y", opts).ok).toBe(true);
    expect(rateLimit("x", opts).ok).toBe(false);
  });

  it("jatah pulih setelah jendela lewat", () => {
    vi.useFakeTimers();
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit("z", opts).ok).toBe(true);
    expect(rateLimit("z", opts).ok).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(rateLimit("z", opts).ok).toBe(true);
  });

  it("retryAfterSeconds masuk akal saat ditolak", () => {
    vi.useFakeTimers();
    const opts = { limit: 1, windowMs: 30_000 };
    rateLimit("r", opts);
    const ditolak = rateLimit("r", opts);
    expect(ditolak.ok).toBe(false);
    expect(ditolak.retryAfterSeconds).toBeGreaterThan(0);
    expect(ditolak.retryAfterSeconds).toBeLessThanOrEqual(30);
  });
});

describe("pengambilan IP", () => {
  it("x-real-ip diutamakan karena tidak bisa dipalsukan klien", () => {
    expect(clientIp(req({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
  });

  it("jatuh ke entri pertama x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("tanpa header apa pun tetap menghasilkan kunci yang stabil", () => {
    expect(clientIp(req())).toBe("unknown");
  });
});

describe("enforceRateLimit", () => {
  it("mengembalikan null selama masih di bawah batas", () => {
    const r = req({ "x-real-ip": "5.5.5.5" });
    expect(enforceRateLimit(r, "uji", { limit: 2, windowMs: 60_000 })).toBeNull();
    expect(enforceRateLimit(r, "uji", { limit: 2, windowMs: 60_000 })).toBeNull();
  });

  it("mengembalikan 429 dengan header Retry-After saat terlampaui", async () => {
    const r = req({ "x-real-ip": "6.6.6.6" });
    enforceRateLimit(r, "uji", { limit: 1, windowMs: 60_000 });
    const res = enforceRateLimit(r, "uji", { limit: 1, windowMs: 60_000 });

    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(Number(res!.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await res!.json()).success).toBe(false);
  });

  it("scope memisahkan hitungan antar-endpoint", () => {
    const r = req({ "x-real-ip": "7.7.7.7" });
    enforceRateLimit(r, "login", { limit: 1, windowMs: 60_000 });
    expect(enforceRateLimit(r, "login", { limit: 1, windowMs: 60_000 })).not.toBeNull();
    expect(enforceRateLimit(r, "checkout", { limit: 1, windowMs: 60_000 })).toBeNull();
  });

  it("subject membatasi per sasaran, bukan per IP", () => {
    const dariIpBerbeda = [req({ "x-real-ip": "1.1.1.1" }), req({ "x-real-ip": "2.2.2.2" })];
    const opts = { limit: 1, windowMs: 60_000 };
    expect(enforceRateLimit(dariIpBerbeda[0], "otp", opts, "0812345")).toBeNull();
    // IP lain, sasaran sama -> tetap ditolak.
    expect(enforceRateLimit(dariIpBerbeda[1], "otp", opts, "0812345")).not.toBeNull();
  });
});
