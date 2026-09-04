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

export interface WithdrawableSummary {
  /** Total komisi yang pernah masuk ke dompet seller. */
  commissionEarned: number;
  /** Penarikan yang sudah diajukan dan belum dibatalkan. */
  committed: number;
  /** Sisa yang boleh ditarik. */
  withdrawable: number;
}

/**
 * Plafon penarikan seller, dihitung dari KOMISI — bukan dari saldo dompet.
 *
 * Merchant dan member berbagi satu baris `Wallet` dengan satu kolom `balance`.
 * Tanpa pembatasan ini, saldo hasil topup lewat payment gateway bisa ditarik ke
 * rekening bank: bayar masuk lewat QRIS, tarik keluar lewat transfer. Jalur kas
 * keluar seperti itu tidak dimaksudkan ada, dan uang yang sudah ditransfer ke
 * bank tidak bisa ditarik balik seperti saldo.
 *
 * Yang dipotong adalah penarikan berstatus PENDING, APPROVED, dan PAID.
 * REJECTED dan CANCELLED tidak dihitung karena saldonya sudah dikembalikan.
 *
 * Soal konkurensi: jumlah penarikan dibaca dengan `FOR UPDATE`. Di bawah
 * REPEATABLE READ, SELECT biasa membaca snapshot dari awal transaksi — dua
 * pengajuan bersamaan akan sama-sama melihat plafon yang belum terpotong.
 * Locking read selalu membaca versi ter-commit terbaru, sehingga pengajuan
 * kedua melihat yang pertama. Pemanggil WAJIB menjalankan ini di dalam
 * transaksi yang sudah menahan saldo, supaya keduanya terurut.
 *
 * Komisi sendiri cukup dibaca biasa: nilainya hanya bertambah, jadi pembacaan
 * yang sedikit tertinggal bersifat konservatif — menolak, bukan meloloskan.
 */
export async function getWithdrawableCommission(
  userId: string,
  db: Pick<typeof prisma, "ledgerEntry" | "$queryRaw"> = prisma,
): Promise<WithdrawableSummary> {
  const komisi = await db.ledgerEntry.aggregate({
    where: { type: "COMMISSION", wallet: { userId } },
    _sum: { amount: true },
  });

  const baris = await db.$queryRaw<Array<{ total: unknown }>>`
    SELECT COALESCE(SUM(amount), 0) AS total
      FROM seller_withdrawal_requests
     WHERE userId = ${userId}
       AND status IN ('PENDING', 'APPROVED', 'PAID')
     FOR UPDATE
  `;

  const commissionEarned = Number(komisi._sum.amount ?? 0);
  const committed = Number(baris[0]?.total ?? 0);

  return {
    commissionEarned,
    committed,
    withdrawable: Math.max(0, commissionEarned - committed),
  };
}
