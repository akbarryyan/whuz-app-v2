/**
 * Gerbang penarikan seller.
 *
 * Sebelumnya pengajuan langsung memanggil createOutgoing, sehingga uang
 * sungguhan meninggalkan saldo merchant di Poppay pada detik seller menekan
 * tombol — tanpa antrean dan tanpa peninjauan. Sekarang berhenti di PENDING.
 *
 * Plafonnya juga dibatasi komisi. Merchant dan member berbagi satu baris Wallet
 * dengan satu kolom balance, jadi tanpa pembatasan itu saldo hasil topup lewat
 * payment gateway bisa dicairkan ke rekening bank.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getWithdrawableCommission } from "@/lib/seller";

const prisma = new PrismaClient();

let userId: string;
let walletId: string;

beforeAll(() => prisma.$connect());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await prisma.sellerWithdrawalRequest.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.user.deleteMany();

  const u = await prisma.user.create({
    data: { email: `wd-${Date.now()}@contoh.test`, name: "Merchant Uji", role: "MEMBER" },
  });
  userId = u.id;
  const w = await prisma.wallet.create({ data: { userId, balance: 0 } });
  walletId = w.id;
});

async function catatLedger(type: string, amount: number, reference: string) {
  await prisma.ledgerEntry.create({
    data: { walletId, type, amount, balanceBefore: 0, balanceAfter: 0, reference },
  });
  await prisma.wallet.update({ where: { id: walletId }, data: { balance: { increment: amount } } });
}

async function ajukan(amount: number, status: string) {
  return prisma.sellerWithdrawalRequest.create({
    data: {
      userId, amount, status,
      accountName: "UJI", accountNumber: "000", bankName: "BANK UJI",
    },
  });
}

describe("plafon penarikan dihitung dari komisi", () => {
  it("saldo hasil topup TIDAK menambah plafon", async () => {
    await catatLedger("CREDIT", 500_000, "topup-1");   // topup lewat QRIS
    await catatLedger("COMMISSION", 30_000, "order-1"); // komisi penjualan

    const saldo = Number((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance);
    const plafon = await getWithdrawableCommission(userId);

    expect(saldo).toBe(530_000);
    expect(plafon.commissionEarned).toBe(30_000);
    expect(plafon.withdrawable).toBe(30_000); // bukan 530.000
  });

  it("tanpa komisi, plafonnya nol meski saldo besar", async () => {
    await catatLedger("CREDIT", 1_000_000, "topup-2");
    expect((await getWithdrawableCommission(userId)).withdrawable).toBe(0);
  });

  it("refund dan release tidak menambah plafon", async () => {
    await catatLedger("REFUND", 200_000, "order-refund");
    await catatLedger("RELEASE", 100_000, "order-release");
    await catatLedger("COMMISSION", 5_000, "order-2");
    expect((await getWithdrawableCommission(userId)).withdrawable).toBe(5_000);
  });
});

describe("penarikan yang sedang berjalan memotong plafon", () => {
  it("PENDING, APPROVED, dan PAID semuanya dihitung", async () => {
    await catatLedger("COMMISSION", 100_000, "order-3");
    await ajukan(10_000, "PENDING");
    await ajukan(20_000, "APPROVED");
    await ajukan(30_000, "PAID");

    const plafon = await getWithdrawableCommission(userId);
    expect(plafon.committed).toBe(60_000);
    expect(plafon.withdrawable).toBe(40_000);
  });

  it("REJECTED dan CANCELLED tidak dihitung — saldonya sudah dikembalikan", async () => {
    await catatLedger("COMMISSION", 100_000, "order-4");
    await ajukan(40_000, "REJECTED");
    await ajukan(50_000, "CANCELLED");

    expect((await getWithdrawableCommission(userId)).withdrawable).toBe(100_000);
  });

  it("plafon tidak pernah negatif", async () => {
    await catatLedger("COMMISSION", 10_000, "order-5");
    await ajukan(50_000, "PAID"); // penarikan lama melebihi komisi sekarang
    expect((await getWithdrawableCommission(userId)).withdrawable).toBe(0);
  });
});
