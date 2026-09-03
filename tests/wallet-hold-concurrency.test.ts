/**
 * Race condition pada HOLD saldo wallet.
 *
 * `OrderRepository.holdWalletBalance` membaca saldo, memeriksanya di JavaScript,
 * lalu menulis kembali nilai ABSOLUT hasil hitungannya:
 *
 *     const wallet = await tx.wallet.findUnique(...)     // SELECT biasa
 *     if (Number(wallet.balance) < amount) return null   // cek di JS
 *     await tx.wallet.update({ data: { balance: balanceAfter } })
 *
 * `$transaction` saja tidak menolong. `findUnique` menghasilkan SELECT tanpa
 * kunci, dan di bawah REPEATABLE READ setiap transaksi membaca snapshot yang
 * sama. Semua pemanggil melihat saldo penuh, semua lolos pemeriksaan, dan
 * semuanya menulis nilai akhir yang identik.
 *
 * Test ini menembakkan beberapa HOLD bersamaan ke wallet yang saldonya hanya
 * cukup untuk SATU. Hanya satu yang boleh berhasil.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";

const prisma = new PrismaClient();
const repo = new OrderRepository();

const SALDO = 10_000;
const NOMINAL = 10_000; // cukup untuk tepat satu hold
const PARALEL = 10;

let userId: string;

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.ledgerEntry.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { email: `uji-${Date.now()}@contoh.test`, name: "Pengguna Uji", role: "MEMBER" },
  });
  userId = user.id;
  await prisma.wallet.create({ data: { userId, balance: SALDO } });
});

describe("holdWalletBalance di bawah konkurensi", () => {
  it(`hanya SATU dari ${PARALEL} hold bersamaan yang boleh berhasil`, async () => {
    const hasil = await Promise.allSettled(
      Array.from({ length: PARALEL }, (_, i) =>
        repo.holdWalletBalance(userId, NOMINAL, `order-uji-${i}`),
      ),
    );

    const berhasil = hasil.filter((r) => r.status === "fulfilled" && r.value !== null).length;
    const ditolak = hasil.filter((r) => r.status === "fulfilled" && r.value === null).length;
    const error = hasil.filter((r) => r.status === "rejected").length;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    const saldoAkhir = Number(wallet!.balance);
    const jumlahHold = await prisma.ledgerEntry.count({ where: { type: "HOLD" } });

    console.log(
      `\n  berhasil=${berhasil}  ditolak=${ditolak}  error=${error}` +
        `\n  saldo akhir=${saldoAkhir}  baris HOLD=${jumlahHold}` +
        `\n  total tertahan=${berhasil * NOMINAL} dari saldo ${SALDO}\n`,
    );

    expect(berhasil).toBe(1);
    expect(jumlahHold).toBe(1);
    expect(saldoAkhir).toBe(SALDO - NOMINAL);
  });

  it("saldo tidak boleh menjadi negatif", async () => {
    await Promise.allSettled(
      Array.from({ length: PARALEL }, (_, i) =>
        repo.holdWalletBalance(userId, NOMINAL, `order-negatif-${i}`),
      ),
    );

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet!.balance)).toBeGreaterThanOrEqual(0);
  });

  it("total nominal yang berhasil di-hold tidak boleh melebihi saldo awal", async () => {
    const hasil = await Promise.allSettled(
      Array.from({ length: PARALEL }, (_, i) =>
        repo.holdWalletBalance(userId, NOMINAL, `order-total-${i}`),
      ),
    );
    const berhasil = hasil.filter((r) => r.status === "fulfilled" && r.value !== null).length;
    expect(berhasil * NOMINAL).toBeLessThanOrEqual(SALDO);
  });
});
