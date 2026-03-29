import { NextResponse } from "next/server";
import { prisma } from "@/src/infra/db/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_METHODS = [
  { key: "qris",         label: "QRIS",                group: "QRIS",            imageUrl: null, sortOrder: 1 },
  { key: "bni_va",       label: "BNI Virtual Account", group: "VIRTUAL_ACCOUNT", imageUrl: null, sortOrder: 2 },
  { key: "bri_va",       label: "BRI Virtual Account", group: "VIRTUAL_ACCOUNT", imageUrl: null, sortOrder: 3 },
  { key: "cimb_niaga_va",label: "CIMB Niaga VA",       group: "VIRTUAL_ACCOUNT", imageUrl: null, sortOrder: 4 },
  { key: "maybank_va",   label: "Maybank VA",          group: "VIRTUAL_ACCOUNT", imageUrl: null, sortOrder: 5 },
  { key: "permata_va",   label: "Permata VA",          group: "VIRTUAL_ACCOUNT", imageUrl: null, sortOrder: 6 },
  { key: "bnc_va",       label: "Bank Neo VA",         group: "VIRTUAL_ACCOUNT", imageUrl: null, sortOrder: 7 },
];

/**
 * GET /api/payment-methods
 * Returns active payment methods, seeding defaults if table is empty.
 */
export async function GET() {
  try {
    const count = await prisma.paymentMethod.count();

    if (count === 0) {
      // Auto-seed default methods
      await prisma.paymentMethod.createMany({
        data: DEFAULT_METHODS.map((m) => ({ ...m, isActive: true })),
        skipDuplicates: true,
      });
    }

    const methods = await prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, key: true, label: true, group: true, imageUrl: true },
    });

    return NextResponse.json({ success: true, data: methods });
  } catch (error) {
    console.error("[PAYMENT METHODS GET ERROR]", error);
    return NextResponse.json({ success: false, error: "Gagal memuat metode pembayaran." }, { status: 500 });
  }
}
