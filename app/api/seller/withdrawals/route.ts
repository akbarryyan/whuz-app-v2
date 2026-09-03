import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/src/infra/db/prisma";
import {
  getWithdrawableCommission,
  requireSellerSession,
  toSellerWithdrawalView,
} from "@/lib/seller";
import { PoppayClient } from "@/src/infra/payment/poppay/poppay.client";

export const dynamic = "force-dynamic";

const WithdrawalSchema = z.object({
  amount: z.number().positive(),
  bankCode: z.string().trim().max(40).optional(),
  accountName: z.string().min(2).max(120),
  accountNumber: z.string().min(3).max(80),
  bankName: z.string().min(2).max(120),
  note: z.string().max(1000).optional(),
});

function normalizeBankLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(pt|tbk|persero)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function resolvePoppayBankCode(explicitBankCode: string | null | undefined, bankName: string): Promise<string> {
  if (explicitBankCode?.trim()) return explicitBankCode.trim();

  const client = new PoppayClient();
  const banks = await client.listBanks({ start: 0, length: 500, filters: [{ key: "c", value: "IDR" }] });
  const normalizedTarget = normalizeBankLabel(bankName);

  const exact = banks.data.find((item) => normalizeBankLabel(item.name) === normalizedTarget);
  if (exact) return exact.code;

  const contains = banks.data.filter((item) => normalizeBankLabel(item.name).includes(normalizedTarget));
  if (contains.length === 1) return contains[0].code;

  throw new Error(
    `Kode bank Poppay untuk "${bankName}" belum ditemukan. Mohon pilih nama bank yang lebih spesifik atau simpan bankCode.`
  );
}

export async function GET() {
  const seller = await requireSellerSession();
  if ("error" in seller) {
    return NextResponse.json({ success: false, error: seller.error }, { status: seller.status });
  }

  const [wallet, withdrawals, plafon] = await Promise.all([
    prisma.wallet.findUnique({
      where: { userId: seller.session.userId! },
      select: { balance: true, updatedAt: true },
    }),
    prisma.sellerWithdrawalRequest.findMany({
      where: { userId: seller.session.userId! },
      orderBy: { createdAt: "desc" },
    }),
    getWithdrawableCommission(seller.session.userId!),
  ]);

  return NextResponse.json({
    success: true,
    wallet: wallet
      ? {
          balance: Number(wallet.balance),
          updatedAt: wallet.updatedAt,
        }
      : { balance: 0, updatedAt: null },
    // Saldo dompet dan plafon penarikan bukan angka yang sama. Tanpa ini UI
    // menampilkan saldo penuh, lalu penarikan ditolak tanpa penjelasan.
    withdrawable: plafon,
    data: withdrawals.map(toSellerWithdrawalView),
  });
}

export async function POST(req: NextRequest) {
  const seller = await requireSellerSession();
  if ("error" in seller) {
    return NextResponse.json({ success: false, error: seller.error }, { status: seller.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Payload tidak valid" }, { status: 400 });
  }

  const parsed = WithdrawalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation error", details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    // Kode bank diselesaikan DI DEPAN, sebelum saldo ditahan. Kalau namanya
    // tidak bisa dipetakan ke kode Poppay, seller tahu sekarang — bukan nanti
    // saat admin menekan approve dan pencairannya gagal.
    const bankCode = await resolvePoppayBankCode(parsed.data.bankCode, parsed.data.bankName);

    const createdRequest = await prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({
        where: { userId: seller.session.userId! },
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { userId: seller.session.userId!, balance: 0 },
        });
      }

      // Kecukupan saldo dan pengurangannya harus terjadi dalam SATU pernyataan
      // UPDATE. Membaca saldo lalu menuliskan kembali nilai absolutnya membuat
      // dua pengajuan bersamaan sama-sama lolos, dan seller bisa menarik lebih
      // dari saldo yang dimilikinya.
      const { count } = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: parsed.data.amount } },
        data: { balance: { decrement: parsed.data.amount } },
      });

      if (count === 0) {
        throw new Error("Saldo seller tidak cukup untuk withdraw");
      }

      // Plafon dihitung dari KOMISI, bukan dari saldo dompet. Saldo hasil topup
      // lewat payment gateway tidak boleh keluar lagi lewat transfer bank.
      //
      // Diperiksa SETELAH saldo ditahan: penahanan itu mengunci baris dompet,
      // sehingga dua pengajuan bersamaan dari seller yang sama terurut dan
      // pengajuan kedua melihat yang pertama sudah terhitung.
      const plafon = await getWithdrawableCommission(seller.session.userId!, tx);
      if (parsed.data.amount > plafon.withdrawable) {
        throw new Error(
          `Maksimal penarikan Rp ${plafon.withdrawable.toLocaleString("id-ID")}. ` +
            "Yang bisa dicairkan hanya komisi penjualan; saldo hasil top up " +
            "hanya dapat dipakai berbelanja.",
        );
      }

      const afterHold = await tx.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
        select: { balance: true },
      });
      const balanceAfter = Number(afterHold.balance);
      const balanceBefore = balanceAfter + parsed.data.amount;

      const request = await tx.sellerWithdrawalRequest.create({
        data: {
          userId: seller.session.userId!,
          amount: new Prisma.Decimal(parsed.data.amount),
          status: "PENDING",
          bankCode,
          accountName: parsed.data.accountName.trim(),
          accountNumber: parsed.data.accountNumber.trim(),
          bankName: parsed.data.bankName.trim(),
          note: parsed.data.note?.trim() || null,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "WITHDRAW_HOLD",
          amount: new Prisma.Decimal(parsed.data.amount),
          balanceBefore: new Prisma.Decimal(balanceBefore),
          balanceAfter: new Prisma.Decimal(balanceAfter),
          reference: request.id,
          description: `Hold withdraw seller ${request.id}`,
        },
      });

      return request;
    });

    // Berhenti di sini. Pencairan dilakukan admin lewat
    // PATCH /api/admin/seller-withdrawals/[id] dengan status APPROVED.
    //
    // Sebelumnya createOutgoing dipanggil tepat di titik ini, sehingga uang
    // sungguhan meninggalkan saldo merchant di Poppay pada detik seller menekan
    // tombol — tanpa antrean, tanpa peninjauan, tanpa kemungkinan membatalkan.
    // Status "PENDING" dan endpoint approval admin sudah ada sejak awal; yang
    // hilang hanyalah jeda di antara keduanya.
    return NextResponse.json({
      success: true,
      data: toSellerWithdrawalView(createdRequest),
      message: "Permintaan penarikan diterima dan menunggu persetujuan admin.",
    });
  } catch (error: unknown) {
    // Penahanan saldo dan pembuatan permintaan berada dalam satu transaksi,
    // jadi kegagalan apa pun membatalkan keduanya. Tidak ada yang perlu
    // dikompensasi di sini.
    const message = error instanceof Error ? error.message : "Gagal membuat request withdraw";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
