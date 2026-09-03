import type { SellerWithdrawalRequest } from "@prisma/client";
import { prisma } from "@/src/infra/db/prisma";
import { getSession } from "@/lib/session";

export async function requireSellerSession() {
  const session = await getSession();

  if (!session.isLoggedIn || !session.userId) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const sellerProfile = await prisma.sellerProfile.findUnique({
    where: { userId: session.userId },
  });

  if (!sellerProfile || !sellerProfile.isActive) {
    return { error: "Seller profile not found or inactive", status: 403 as const };
  }

  return {
    session,
    sellerProfile,
  };
}

export function slugifySellerName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Bentuk data withdrawal yang aman dikirim ke seller.
 *
 * `payoutRefId` sengaja TIDAK diikutkan. Itu referensi milik Poppay yang
 * disimpan saat createOutgoing, dan lib/poppay-callback.ts memakainya untuk
 * memverifikasi keaslian callback penarikan — Poppay tidak menyediakan
 * endpoint inquiry untuk transaksi keluar, jadi tidak ada pembanding lain.
 * Membocorkannya ke seller memberi mereka bahan untuk memalsukan callback
 * penolakan dan menarik kembali saldo yang transfernya sudah jalan.
 *
 * `payoutRawPayload` juga tidak diikutkan karena memuat respons mentah gateway.
 *
 * `payoutAggRefId` tetap ikut: isinya `withdraw-<id>` yang memang sudah
 * diketahui seller, jadi tidak menambah informasi apa pun.
 */
export function toSellerWithdrawalView(w: SellerWithdrawalRequest) {
  return {
    id: w.id,
    amount: Number(w.amount),
    status: w.status,
    bankCode: w.bankCode,
    bankName: w.bankName,
    accountName: w.accountName,
    accountNumber: w.accountNumber,
    note: w.note,
    processedNote: w.processedNote,
    payoutGateway: w.payoutGateway,
    payoutAggRefId: w.payoutAggRefId,
    processedAt: w.processedAt,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}
