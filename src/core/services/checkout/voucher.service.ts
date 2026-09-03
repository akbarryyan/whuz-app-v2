/**
 * Resolusi dan klaim voucher.
 *
 * Sebelumnya logika ini ada di app/api/checkout/route.ts dengan tiga cacat:
 *
 * 1. Basis diskon diambil dari `product.sellingPrice`, padahal tagihan
 *    sebenarnya dihitung CreateCheckoutService dari `basePrice + markup` yang
 *    tier-aware, atau dari harga produk seller. Untuk produk seller yang lebih
 *    murah, diskonnya bisa melebihi harga aslinya, dan `minPurchase`
 *    dibandingkan terhadap angka yang salah.
 * 2. Kuota dicek lebih dulu, lalu ditambah jauh setelahnya. Dua checkout
 *    bersamaan sama-sama melihat kuota masih ada.
 * 3. Penandaan terpakai dipanggil tanpa `await` dan menelan errornya sendiri,
 *    sehingga kegagalan pencatatan berarti voucher tidak pernah tertandai —
 *    diam-diam bisa dipakai berkali-kali.
 *
 * Modul ini menaruh resolusi di tempat harga sebenarnya sudah diketahui, dan
 * menjadikan klaim sebagai operasi atomik di database.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/infra/db/prisma";

export interface VoucherResolution {
  voucherId: string;
  code: string;
  discountAmount: number;
}

/** Klien Prisma biasa maupun klien di dalam transaksi. */
type Db = Pick<typeof prisma, "voucher" | "voucherClaim" | "$executeRaw">;

/**
 * Hitung diskon untuk `grossAmount` — nilai yang BENAR-BENAR akan ditagihkan
 * sebelum diskon. Tidak mengubah apa pun; kuota belum diklaim di sini.
 * Mengembalikan null bila voucher tidak berlaku.
 */
export async function resolveVoucher(
  code: string | undefined,
  grossAmount: number,
  userId: string | null,
  db: Db = prisma,
): Promise<VoucherResolution | null> {
  if (!code) return null;

  const voucher = await db.voucher.findUnique({ where: { code: code.toUpperCase() } });
  if (!voucher || !voucher.isActive) return null;

  const now = new Date();
  if (voucher.startDate && now < voucher.startDate) return null;
  if (voucher.endDate && now > voucher.endDate) return null;
  if (voucher.quota !== null && voucher.usedCount >= voucher.quota) return null;
  if (grossAmount < Number(voucher.minPurchase)) return null;

  if (userId) {
    const terpakai = await db.voucherClaim.count({
      where: { voucherId: voucher.id, userId, status: "USED" },
    });
    if (terpakai >= voucher.perUserLimit) return null;
  }

  let discountAmount: number;
  if (voucher.discountType === "FIXED") {
    discountAmount = Number(voucher.discountValue);
  } else {
    discountAmount = Math.floor((grossAmount * Number(voucher.discountValue)) / 100);
    if (voucher.maxDiscount !== null) {
      discountAmount = Math.min(discountAmount, Number(voucher.maxDiscount));
    }
  }

  // Tidak boleh menggratiskan sepenuhnya.
  discountAmount = Math.min(discountAmount, grossAmount - 1);
  if (discountAmount <= 0) return null;

  return { voucherId: voucher.id, code: voucher.code, discountAmount };
}

/**
 * Ambil satu slot kuota secara atomik.
 *
 * Prisma belum bisa membandingkan dua kolom di klausa where (`usedCount <
 * quota`), jadi dipakai UPDATE mentah. MySQL mengevaluasi syaratnya dengan
 * kunci baris saat UPDATE berjalan, sehingga hanya sejumlah kuota yang bisa
 * berhasil betapapun banyak pemanggil bersamaan.
 */
async function ambilSlotKuota(db: Db, voucherId: string): Promise<boolean> {
  const terpengaruh = await db.$executeRaw`
    UPDATE vouchers
       SET usedCount = usedCount + 1
     WHERE id = ${voucherId}
       AND (quota IS NULL OR usedCount < quota)
  `;
  return terpengaruh === 1;
}

/**
 * Klaim voucher untuk satu order. Mengembalikan false bila kuota habis atau
 * user sudah memakainya — pemanggil harus melanjutkan tanpa diskon.
 *
 * Batas per-user ditegakkan lewat unique constraint (voucherId, userId) pada
 * voucher_claims: baris yang berstatus CLAIMED (dari halaman /voucher) diubah
 * jadi USED secara kondisional, dan bila belum ada barisnya, pembuatan baru
 * yang bentrok berarti ada pemanggil lain yang menang.
 */
export async function claimVoucher(
  voucherId: string,
  userId: string | null,
  db: Db = prisma,
): Promise<boolean> {
  if (!(await ambilSlotKuota(db, voucherId))) return false;

  // Tamu tidak punya baris klaim; kuota global sudah cukup.
  if (!userId) return true;

  const diubah = await db.voucherClaim.updateMany({
    where: { voucherId, userId, status: { not: "USED" } },
    data: { status: "USED", usedAt: new Date() },
  });
  if (diubah.count === 1) return true;

  try {
    await db.voucherClaim.create({
      data: { voucherId, userId, status: "USED", usedAt: new Date() },
    });
    return true;
  } catch (err) {
    // P2002 = bentrok unique, artinya user ini sudah memakainya.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await lepasSlotKuota(db, voucherId);
      return false;
    }
    await lepasSlotKuota(db, voucherId);
    throw err;
  }
}

async function lepasSlotKuota(db: Db, voucherId: string) {
  await db.$executeRaw`
    UPDATE vouchers
       SET usedCount = usedCount - 1
     WHERE id = ${voucherId}
       AND usedCount > 0
  `;
}

/**
 * Kembalikan klaim ketika order gagal dibuat setelah voucher terklaim.
 * Tanpa ini, kegagalan pembuatan order akan menghanguskan satu slot kuota.
 */
export async function releaseVoucher(
  voucherId: string,
  userId: string | null,
  db: Db = prisma,
): Promise<void> {
  await lepasSlotKuota(db, voucherId);
  if (!userId) return;
  await db.voucherClaim.updateMany({
    where: { voucherId, userId, status: "USED", orderId: null },
    data: { status: "CLAIMED", usedAt: null },
  });
}

/** Tautkan klaim ke order setelah ordernya benar-benar terbentuk. */
export async function attachVoucherClaimToOrder(
  voucherId: string,
  userId: string | null,
  orderId: string,
  db: Db = prisma,
): Promise<void> {
  if (!userId) return;
  await db.voucherClaim.updateMany({
    where: { voucherId, userId, status: "USED", orderId: null },
    data: { orderId },
  });
}
