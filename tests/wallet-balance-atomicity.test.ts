/**
 * Semua mutasi saldo harus atomik.
 *
 * Pola lama di seluruh codebase adalah baca-saldo → hitung di JavaScript →
 * tulis nilai absolut. Untuk penambahan saldo, pola itu membuat kredit yang
 * berjalan bersamaan saling menimpa: sepuluh refund masing-masing 1.000 bisa
 * berakhir menambah 1.000 saja, dan selisihnya hilang tanpa jejak selain
 * ketidakcocokan antara ledger dan saldo.
 *
 * Test ini menembakkan operasi bersamaan lalu memeriksa bahwa saldo akhir sama
 * dengan jumlah seluruh operasi yang tercatat di ledger.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";

const prisma = new PrismaClient();
const repo = new OrderRepository();

const PARALEL = 10;
const NOMINAL = 1_000;

let userId: string;

beforeAll(() => prisma.$connect());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await prisma.ledgerEntry.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
  const user = await prisma.user.create({
    data: { email: `atomik-${Date.now()}@contoh.test`, name: "Uji", role: "MEMBER" },
  });
  userId = user.id;
  await prisma.wallet.create({ data: { userId, balance: 0 } });
});

const saldo = async () =>
  Number((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance);

describe("penambahan saldo bersamaan", () => {
  it(`${PARALEL} release bersamaan menambah saldo sebesar totalnya`, async () => {
    await Promise.all(
      Array.from({ length: PARALEL }, (_, i) =>
        repo.releaseWalletHold(userId, NOMINAL, `rilis-${i}`),
      ),
    );
    expect(await saldo()).toBe(PARALEL * NOMINAL);
    expect(await prisma.ledgerEntry.count({ where: { type: "RELEASE" } })).toBe(PARALEL);
  });

  it(`${PARALEL} komisi seller bersamaan tidak saling menimpa`, async () => {
    const orders: string[] = [];
    const product = await prisma.product.create({
      data: {
        provider: "DIGIFLAZZ", providerCode: "UJI-1",
        name: "Produk Uji", category: "UJI", brand: "UJI",
        providerPrice: 0, sellingPrice: 0, margin: 0, type: "PREPAID",
      },
    });
    for (let i = 0; i < PARALEL; i++) {
      const o = await prisma.order.create({
        data: {
          orderCode: `WP-KOM-${i}`, productId: product.id, sellerId: userId,
          targetNumber: "0812", amount: NOMINAL, sellerCommission: NOMINAL,
          status: "SUCCESS", paymentMethod: "PAYMENT_GATEWAY",
        },
      });
      orders.push(o.id);
    }

    await Promise.all(orders.map((id) => repo.creditSellerCommission(id)));

    expect(await saldo()).toBe(PARALEL * NOMINAL);
    expect(await prisma.ledgerEntry.count({ where: { type: "COMMISSION" } })).toBe(PARALEL);
  });
});

describe("saldo akhir selalu cocok dengan ledger", () => {
  it("campuran hold dan release bersamaan tetap konsisten", async () => {
    await prisma.wallet.update({ where: { userId }, data: { balance: PARALEL * NOMINAL } });

    await Promise.all([
      ...Array.from({ length: PARALEL }, (_, i) =>
        repo.holdWalletBalance(userId, NOMINAL, `campur-hold-${i}`),
      ),
      ...Array.from({ length: PARALEL }, (_, i) =>
        repo.releaseWalletHold(userId, NOMINAL, `campur-rilis-${i}`),
      ),
    ]);

    const entries = await prisma.ledgerEntry.findMany({ select: { type: true, amount: true } });
    const delta = entries.reduce(
      (acc, e) => acc + (e.type === "HOLD" ? -Number(e.amount) : Number(e.amount)),
      0,
    );

    // Saldo awal PARALEL*NOMINAL, digeser sebesar delta seluruh ledger.
    expect(await saldo()).toBe(PARALEL * NOMINAL + delta);
  });
});
