/**
 * Idempotensi webhook: yang boleh menghentikan pemrosesan hanyalah event yang
 * benar-benar SELESAI, bukan sekadar "pernah dicoba".
 *
 * Baris WebhookEvent dibuat SEBELUM pemrosesan dimulai. Sebelumnya, pemanggil
 * memperlakukan keberadaan baris itu sebagai duplikat, sehingga percobaan yang
 * gagal ikut terkunci: gateway mengirim ulang callback, kita menolaknya, dan
 * order tertinggal di PAID tanpa ada yang menyelesaikan.
 *
 * Sebaliknya, event yang sudah selesai TETAP harus ditolak — kiriman ulang
 * tidak boleh memindahkan uang dua kali.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";
import { handlePoppayCallback } from "@/lib/poppay-callback";

const prisma = new PrismaClient();
const repo = new OrderRepository();

beforeAll(() => prisma.$connect());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await prisma.webhookEvent.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.sellerWithdrawalRequest.deleteMany();
  await prisma.walletTopup.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
});

const buatEvent = (eventId: string) =>
  repo.findOrCreateWebhookEvent({
    source: "POPPAY",
    eventId,
    eventType: "5",
    payload: { contoh: true },
  });

describe("semantik WebhookEvent", () => {
  it("percobaan yang belum selesai TIDAK dianggap duplikat", async () => {
    const pertama = await buatEvent("uji:belum-selesai");
    expect(pertama.alreadyProcessed).toBe(false);

    // Gateway mengirim ulang sebelum percobaan pertama berhasil.
    const kedua = await buatEvent("uji:belum-selesai");
    expect(kedua.alreadyProcessed).toBe(false);
  });

  it("event yang sudah selesai dianggap duplikat", async () => {
    await buatEvent("uji:selesai");
    await repo.markWebhookProcessed("uji:selesai");

    const ulang = await buatEvent("uji:selesai");
    expect(ulang.alreadyProcessed).toBe(true);
  });

  it("event yang ditandai gagal tetap terbuka untuk dicoba ulang", async () => {
    await buatEvent("uji:gagal");
    await repo.markWebhookProcessed("uji:gagal", "detailPayment failed");

    const ulang = await buatEvent("uji:gagal");
    expect(ulang.alreadyProcessed).toBe(false);
    expect(ulang.event.errorMessage).toBe("detailPayment failed");
  });
});

describe("callback penarikan Poppay", () => {
  const NOMINAL = 50_000;
  const REF = "POPPAY-REF-UJI";

  async function siapkanPenarikan() {
    const user = await prisma.user.create({
      data: { email: `wh-${Date.now()}@contoh.test`, name: "Uji", role: "MEMBER" },
    });
    await prisma.wallet.create({ data: { userId: user.id, balance: 0 } });
    const w = await prisma.sellerWithdrawalRequest.create({
      data: {
        userId: user.id, amount: NOMINAL, status: "APPROVED",
        accountName: "UJI", accountNumber: "000", bankName: "BANK UJI",
        payoutGateway: "POPPAY", payoutRefId: REF, payoutAggRefId: "sementara",
      },
    });
    await prisma.sellerWithdrawalRequest.update({
      where: { id: w.id }, data: { payoutAggRefId: `withdraw-${w.id}` },
    });
    return { userId: user.id, withdrawalId: w.id };
  }

  const saldo = async (userId: string) =>
    Number((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance);

  it("kiriman ulang setelah berhasil TIDAK mengembalikan saldo dua kali", async () => {
    const { userId, withdrawalId } = await siapkanPenarikan();
    const payload = { refid: REF, agg_refid: `withdraw-${withdrawalId}`, amount: NOMINAL, status: 1 };

    const pertama = await handlePoppayCallback(payload, payload);
    expect(pertama.action).toBe("rejected_withdrawal");
    expect(await saldo(userId)).toBe(NOMINAL);

    const kedua = await handlePoppayCallback(payload, payload);
    expect(kedua.duplicate).toBe(true);
    expect(await saldo(userId)).toBe(NOMINAL);
    expect(await prisma.ledgerEntry.count({ where: { type: "WITHDRAW_RELEASE" } })).toBe(1);
  });

  it("callback untuk penarikan yang belum ada bisa dicoba ulang saat datanya menyusul", async () => {
    // Kondisi balapan: callback tiba sebelum baris penarikan tersimpan.
    const payloadAwal = { refid: REF, agg_refid: "withdraw-belum-ada", amount: NOMINAL, status: 1 };
    const awal = await handlePoppayCallback(payloadAwal, payloadAwal);
    expect(awal.action).toBe("not_found");

    const ev = await prisma.webhookEvent.findUniqueOrThrow({
      where: { eventId: `poppay:withdraw-belum-ada:1:${REF}` },
    });
    expect(ev.processed).toBe(false);

    // Kiriman ulang dengan eventId yang sama tidak boleh ditolak sebagai duplikat.
    const ulang = await handlePoppayCallback(payloadAwal, payloadAwal);
    expect(ulang.duplicate).toBe(false);
    expect(ulang.action).toBe("not_found");
  });
});
