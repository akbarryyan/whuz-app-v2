/**
 * Penjaga duplikat harus atomik.
 *
 * Perbaikan sebelumnya membuat ARITMETIKA saldo atomik. Tapi penjaga yang
 * memutuskan "sudah pernah dibayar atau belum" masih memakai pola yang sama
 * seperti bug yang sudah diperbaiki itu: baca, cek di JavaScript, lalu tulis.
 *
 *     const existingRefund = await tx.ledgerEntry.findFirst({ ... });
 *     if (existingRefund) return { duplicated: true };
 *
 *     if (order.sellerCommissionCreditedAt) return null;
 *
 * Dua pemanggil bersamaan sama-sama melihat "belum ada", keduanya lanjut, dan
 * uangnya dibayar dua kali.
 *
 * Jalurnya terjangkau: autoReconcileOrderNow dipicu dari app/api/orders/[code]
 * yang publik, dan creditSellerCommission punya empat titik masuk (eksekusi
 * provider, reconcile, dan dua tempat di webhook VIP).
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";

const prisma = new PrismaClient();
const repo = new OrderRepository();

const PARALEL = 10;
const NOMINAL = 25_000;

let userId: string;
let productId: string;

beforeAll(() => prisma.$connect());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await prisma.ledgerEntry.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { email: `guard-${Date.now()}@contoh.test`, name: "Uji", role: "MEMBER" },
  });
  userId = user.id;
  await prisma.wallet.create({ data: { userId, balance: 0 } });

  const product = await prisma.product.create({
    data: {
      provider: "DIGIFLAZZ", providerCode: "UJI-1", name: "Produk Uji",
      category: "UJI", brand: "UJI", type: "PREPAID",
      providerPrice: 0, sellingPrice: 0,
    },
  });
  productId = product.id;
});

const saldo = async () =>
  Number((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance);

describe("refund order yang sudah dibayar", () => {
  it(`${PARALEL} refund bersamaan atas order yang SAMA hanya boleh membayar sekali`, async () => {
    const order = await prisma.order.create({
      data: {
        orderCode: `WP-REF-${Date.now()}`, productId, userId,
        targetNumber: "0812", amount: NOMINAL,
        status: "PAID", paymentMethod: "PAYMENT_GATEWAY",
      },
    });

    const hasil = await Promise.allSettled(
      Array.from({ length: PARALEL }, () =>
        repo.refundPaidOrderToWallet(userId, NOMINAL, order.id),
      ),
    );

    const dibayar = hasil.filter(
      (r) => r.status === "fulfilled" && r.value && !r.value.duplicated,
    ).length;
    const barisRefund = await prisma.ledgerEntry.count({ where: { type: "REFUND" } });

    console.log(
      `\n  refund dibayar=${dibayar}  baris REFUND=${barisRefund}  saldo=${await saldo()}` +
        `  (seharusnya 1 / 1 / ${NOMINAL})\n`,
    );

    expect(dibayar).toBe(1);
    expect(barisRefund).toBe(1);
    expect(await saldo()).toBe(NOMINAL);
  });

  it("order lama yang sudah punya ledger REFUND tapi penandanya kosong tidak dibayar ulang", async () => {
    // Meniru data sebelum migrasi: ledger REFUND sudah ada, refundedAt masih
    // NULL karena kolomnya baru ditambahkan. Backfill di migrasi seharusnya
    // mengisinya, tapi penjaga berbasis ledger tetap dipertahankan sebagai
    // lapis pengaman kalau ada baris yang lolos backfill.
    const order = await prisma.order.create({
      data: {
        orderCode: `WP-LAMA-${Date.now()}`, productId, userId,
        targetNumber: "0812", amount: NOMINAL,
        status: "REFUNDED", paymentMethod: "PAYMENT_GATEWAY",
      },
    });
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    await prisma.ledgerEntry.create({
      data: {
        walletId: wallet.id, type: "REFUND", amount: NOMINAL,
        balanceBefore: 0, balanceAfter: NOMINAL, reference: order.id,
        description: "refund lama sebelum migrasi",
      },
    });
    await prisma.wallet.update({ where: { userId }, data: { balance: NOMINAL } });

    const hasil = await repo.refundPaidOrderToWallet(userId, NOMINAL, order.id);

    expect(hasil?.duplicated).toBe(true);
    expect(await saldo()).toBe(NOMINAL);
    expect(await prisma.ledgerEntry.count({ where: { type: "REFUND" } })).toBe(1);
  });
});

describe("komisi seller", () => {
  it(`${PARALEL} pemberian komisi bersamaan atas order yang SAMA hanya boleh sekali`, async () => {
    const order = await prisma.order.create({
      data: {
        orderCode: `WP-KOM-${Date.now()}`, productId, sellerId: userId,
        targetNumber: "0812", amount: NOMINAL, sellerCommission: NOMINAL,
        status: "SUCCESS", paymentMethod: "PAYMENT_GATEWAY",
      },
    });

    await Promise.allSettled(
      Array.from({ length: PARALEL }, () => repo.creditSellerCommission(order.id)),
    );

    const barisKomisi = await prisma.ledgerEntry.count({ where: { type: "COMMISSION" } });

    console.log(
      `\n  baris COMMISSION=${barisKomisi}  saldo=${await saldo()}` +
        `  (seharusnya 1 / ${NOMINAL})\n`,
    );

    expect(barisKomisi).toBe(1);
    expect(await saldo()).toBe(NOMINAL);
  });
});
