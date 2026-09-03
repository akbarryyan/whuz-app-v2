/**
 * Klaim voucher harus atomik, dan diskon harus dihitung dari nilai yang
 * BENAR-BENAR ditagihkan.
 *
 * Versi sebelumnya di app/api/checkout/route.ts memeriksa kuota lebih dulu lalu
 * menambah usedCount jauh setelahnya, tanpa `await`, dan menghitung diskon dari
 * `product.sellingPrice` alih-alih harga tier-aware atau harga produk seller.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { claimVoucher, resolveVoucher, releaseVoucher } from "@/src/core/services/checkout/voucher.service";

const prisma = new PrismaClient();
const PARALEL = 10;

beforeAll(() => prisma.$connect());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await prisma.voucherClaim.deleteMany();
  await prisma.voucher.deleteMany();
  await prisma.user.deleteMany();
});

async function buatVoucher(over: Partial<Parameters<typeof prisma.voucher.create>[0]["data"]> = {}) {
  return prisma.voucher.create({
    data: {
      code: `UJI${Date.now()}${Math.floor(Math.random() * 1000)}`,
      title: "Voucher Uji",
      discountType: "FIXED",
      discountValue: 5_000,
      minPurchase: 0,
      quota: 1,
      perUserLimit: 1,
      isActive: true,
      ...over,
    },
  });
}

describe("kuota voucher", () => {
  it(`kuota 1 dengan ${PARALEL} klaim bersamaan hanya boleh terpakai sekali`, async () => {
    const v = await buatVoucher({ quota: 1 });

    const hasil = await Promise.all(
      Array.from({ length: PARALEL }, () => claimVoucher(v.id, null)),
    );
    const berhasil = hasil.filter(Boolean).length;
    const after = await prisma.voucher.findUniqueOrThrow({ where: { id: v.id } });

    console.log(`\n  klaim berhasil=${berhasil}  usedCount=${after.usedCount}  (kuota ${v.quota})\n`);

    expect(berhasil).toBe(1);
    expect(after.usedCount).toBe(1);
  });

  it("kuota 3 dengan 10 klaim bersamaan berhenti tepat di 3", async () => {
    const v = await buatVoucher({ quota: 3 });
    const hasil = await Promise.all(
      Array.from({ length: PARALEL }, () => claimVoucher(v.id, null)),
    );
    expect(hasil.filter(Boolean).length).toBe(3);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: v.id } })).usedCount).toBe(3);
  });

  it("kuota null berarti tak terbatas", async () => {
    const v = await buatVoucher({ quota: null });
    const hasil = await Promise.all(
      Array.from({ length: PARALEL }, () => claimVoucher(v.id, null)),
    );
    expect(hasil.filter(Boolean).length).toBe(PARALEL);
  });
});

describe("batas per-user", () => {
  it("user yang sama tidak bisa memakai voucher dua kali walau kuota masih ada", async () => {
    const v = await buatVoucher({ quota: 100 });
    const u = await prisma.user.create({
      data: { email: `v-${Date.now()}@contoh.test`, name: "Uji", role: "MEMBER" },
    });

    const hasil = await Promise.all(
      Array.from({ length: PARALEL }, () => claimVoucher(v.id, u.id)),
    );

    expect(hasil.filter(Boolean).length).toBe(1);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: v.id } })).usedCount).toBe(1);
    expect(await prisma.voucherClaim.count({ where: { voucherId: v.id, status: "USED" } })).toBe(1);
  });
});

describe("pembatalan klaim", () => {
  it("release mengembalikan slot kuota saat order gagal dibuat", async () => {
    const v = await buatVoucher({ quota: 1 });
    expect(await claimVoucher(v.id, null)).toBe(true);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: v.id } })).usedCount).toBe(1);

    await releaseVoucher(v.id, null);
    expect((await prisma.voucher.findUniqueOrThrow({ where: { id: v.id } })).usedCount).toBe(0);
    expect(await claimVoucher(v.id, null)).toBe(true);
  });
});

describe("basis perhitungan diskon", () => {
  it("diskon persen dihitung dari nilai yang ditagihkan, bukan harga katalog", async () => {
    const v = await buatVoucher({ discountType: "PERCENT", discountValue: 10, quota: null });

    // Harga katalog 100.000, tapi harga seller/tier yang ditagih 50.000.
    const hasil = await resolveVoucher(v.code, 50_000, null);
    expect(hasil?.discountAmount).toBe(5_000); // 10% dari 50.000, bukan dari 100.000
  });

  it("diskon tidak boleh melebihi nilai yang ditagihkan", async () => {
    const v = await buatVoucher({ discountType: "FIXED", discountValue: 999_999, quota: null });
    const hasil = await resolveVoucher(v.code, 10_000, null);
    expect(hasil?.discountAmount).toBe(9_999); // maksimal, sisakan 1
  });

  it("minPurchase dibandingkan terhadap nilai yang ditagihkan", async () => {
    const v = await buatVoucher({ minPurchase: 60_000, quota: null });
    expect(await resolveVoucher(v.code, 50_000, null)).toBeNull();
    expect(await resolveVoucher(v.code, 60_000, null)).not.toBeNull();
  });
});
