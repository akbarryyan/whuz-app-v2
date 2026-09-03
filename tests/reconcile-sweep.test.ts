/**
 * Sapuan rekonsiliasi berbasis database.
 *
 * Yang diuji di sini adalah pemilihan order-nya — bagian yang menggantikan
 * jadwal setTimeout in-memory. Jadwal lama hilang setiap kali proses berhenti;
 * sapuan ini menurunkan pekerjaannya dari database setiap kali berjalan,
 * sehingga restart tidak menghilangkan apa pun.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";

const prisma = new PrismaClient();
const repo = new OrderRepository();

let productId: string;

beforeAll(() => prisma.$connect());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  const p = await prisma.product.create({
    data: {
      provider: "DIGIFLAZZ", providerCode: "SWEEP-1", name: "Produk Sapuan",
      category: "UJI", brand: "UJI", type: "PREPAID", providerPrice: 0, sellingPrice: 0,
    },
  });
  productId = p.id;
});

/** updatedAt hanya bisa dimundurkan lewat SQL mentah — Prisma mengelolanya sendiri. */
async function buatOrder(status: string, umurMenit: number, kode: string) {
  const o = await prisma.order.create({
    data: {
      orderCode: kode, productId, targetNumber: "0812",
      amount: 1000, status, paymentMethod: "PAYMENT_GATEWAY",
    },
  });
  const waktu = new Date(Date.now() - umurMenit * 60_000);
  await prisma.$executeRaw`UPDATE orders SET updatedAt = ${waktu} WHERE id = ${o.id}`;
  return o;
}

describe("pemilihan order tersangkut", () => {
  it("hanya mengambil status PAID dan PROCESSING_PROVIDER", async () => {
    await buatOrder("PAID", 10, "WP-A");
    await buatOrder("PROCESSING_PROVIDER", 10, "WP-B");
    await buatOrder("SUCCESS", 10, "WP-C");
    await buatOrder("FAILED", 10, "WP-D");
    await buatOrder("WAITING_PAYMENT", 10, "WP-E");

    const hasil = await repo.findPendingProviderOrders(2, 100);
    expect(hasil.map((o) => o.orderCode).sort()).toEqual(["WP-A", "WP-B"]);
  });

  it("melewati order yang masih baru — providernya mungkin sedang bekerja", async () => {
    await buatOrder("PAID", 0, "WP-BARU");
    await buatOrder("PAID", 10, "WP-LAMA");

    const hasil = await repo.findPendingProviderOrders(2, 100);
    expect(hasil.map((o) => o.orderCode)).toEqual(["WP-LAMA"]);
  });

  it("menghormati batas jumlah per sapuan", async () => {
    for (let i = 0; i < 10; i++) await buatOrder("PAID", 10, `WP-BATAS-${i}`);
    expect((await repo.findPendingProviderOrders(2, 3)).length).toBe(3);
  });

  it("yang paling lama tersangkut didahulukan", async () => {
    await buatOrder("PAID", 5, "WP-MUDA");
    await buatOrder("PAID", 60, "WP-TUA");
    await buatOrder("PAID", 30, "WP-TENGAH");

    const hasil = await repo.findPendingProviderOrders(2, 100);
    expect(hasil.map((o) => o.orderCode)).toEqual(["WP-TUA", "WP-TENGAH", "WP-MUDA"]);
  });

  it("tidak ada yang tersangkut menghasilkan daftar kosong", async () => {
    await buatOrder("SUCCESS", 60, "WP-SELESAI");
    expect(await repo.findPendingProviderOrders(2, 100)).toEqual([]);
  });
});
