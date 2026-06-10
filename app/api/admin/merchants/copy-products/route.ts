import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/src/infra/db/prisma";

export const dynamic = "force-dynamic";

const CopyProductsSchema = z.object({
  sourceMerchantId: z.string().min(1),
  targetMerchantIds: z.array(z.string().min(1)).min(1),
});

async function ensureAdmin() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId || session.role !== "ADMIN") {
    return null;
  }
  return session;
}

export async function POST(request: NextRequest) {
  try {
    const session = await ensureAdmin();
    if (!session) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = CopyProductsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const sourceMerchant = await prisma.sellerProfile.findUnique({
      where: { id: parsed.data.sourceMerchantId },
      select: {
        id: true,
        displayName: true,
        userId: true,
      },
    });

    if (!sourceMerchant) {
      return NextResponse.json({ success: false, error: "Merchant sumber tidak ditemukan" }, { status: 404 });
    }

    const uniqueTargetIds = Array.from(new Set(parsed.data.targetMerchantIds)).filter(
      (id) => id !== parsed.data.sourceMerchantId
    );

    if (uniqueTargetIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Pilih minimal satu merchant target yang berbeda dari merchant sumber" },
        { status: 400 }
      );
    }

    const targetMerchants = await prisma.sellerProfile.findMany({
      where: { id: { in: uniqueTargetIds } },
      select: {
        id: true,
        displayName: true,
        userId: true,
      },
    });

    if (targetMerchants.length === 0) {
      return NextResponse.json({ success: false, error: "Merchant target tidak ditemukan" }, { status: 404 });
    }

    const [sourceProducts, allSourceProducts] = await Promise.all([
      prisma.sellerProduct.findMany({
        where: { sellerId: sourceMerchant.userId, isActive: true },
        select: {
          productId: true,
          product: { select: { sellingPrice: true } },
        },
      }),
      prisma.sellerProduct.count({ where: { sellerId: sourceMerchant.userId } }),
    ]);

    // Fetch the actual User.id via relation to verify it matches userId field
    const profileWithUser = await prisma.sellerProfile.findUnique({
      where: { id: parsed.data.sourceMerchantId },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            sellerProducts: { where: { isActive: true }, select: { id: true } },
          },
        },
      },
    });

    // Raw SQL to bypass any Prisma ORM layer differences
    const rawCount = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) as cnt FROM seller_products WHERE seller_id = ${sourceMerchant.userId}
    `;
    const rawActiveCount = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) as cnt FROM seller_products WHERE seller_id = ${sourceMerchant.userId} AND is_active = 1
    `;
    // Also check the actual column name used in the DB
    const sampleRow = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM seller_products LIMIT 1
    `;

    // Find ANY seller_products rows that could belong to this merchant by looking
    // for sellerIds that look like cuid IDs around the same merchant display name
    const nearbyProducts = await prisma.sellerProduct.findMany({
      where: {
        seller: {
          sellerProfile: { id: parsed.data.sourceMerchantId },
        },
      },
      select: { id: true, sellerId: true, isActive: true },
      take: 5,
    });

    console.log("[copy-products] sourceMerchantId:", parsed.data.sourceMerchantId);
    console.log("[copy-products] sourceMerchant.userId:", sourceMerchant.userId);
    console.log("[copy-products] profileWithUser.userId:", profileWithUser?.userId);
    console.log("[copy-products] profileWithUser.user.id:", profileWithUser?.user?.id);
    console.log("[copy-products] relation sellerProducts count:", profileWithUser?.user?.sellerProducts?.length);
    console.log("[copy-products] direct query active products:", sourceProducts.length, "/ total:", allSourceProducts);
    console.log("[copy-products] via nested profile filter:", nearbyProducts.length, nearbyProducts.map(p => p.sellerId));
    console.log("[copy-products] raw SQL total:", Number(rawCount[0]?.cnt ?? 0), "| raw SQL active:", Number(rawActiveCount[0]?.cnt ?? 0));
    console.log("[copy-products] sample row columns:", sampleRow[0] ? Object.keys(sampleRow[0]) : "no rows in table");

    if (sourceProducts.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: allSourceProducts > 0
            ? `Merchant sumber memiliki ${allSourceProducts} produk tetapi semuanya tidak aktif. Aktifkan dulu produk di dashboard merchant sebelum menyalin.`
            : "Merchant sumber belum memiliki produk untuk disalin.",
          debug: { sourceMerchantUserId: sourceMerchant.userId, activeCount: sourceProducts.length, totalCount: allSourceProducts },
        },
        { status: 400 }
      );
    }

    const sourceProductIds = sourceProducts.map((item) => item.productId);

    const existingTargetProducts = await prisma.sellerProduct.findMany({
      where: {
        sellerId: { in: targetMerchants.map((item) => item.userId) },
        productId: { in: sourceProductIds },
      },
      select: {
        sellerId: true,
        productId: true,
      },
    });

    const existingKeys = new Set(
      existingTargetProducts.map((item) => `${item.sellerId}:${item.productId}`)
    );

    const payload: Array<{
      sellerId: string;
      productId: string;
      sellingPrice: number;
      isActive: boolean;
    }> = [];

    for (const target of targetMerchants) {
      for (const item of sourceProducts) {
        const key = `${target.userId}:${item.productId}`;
        if (existingKeys.has(key)) continue;
        payload.push({
          sellerId: target.userId,
          productId: item.productId,
          sellingPrice: Number(item.product.sellingPrice),
          isActive: true,
        });
      }
    }

    if (payload.length > 0) {
      await prisma.sellerProduct.createMany({
        data: payload,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        sourceMerchant: {
          id: sourceMerchant.id,
          displayName: sourceMerchant.displayName,
        },
        targetCount: targetMerchants.length,
        sourceProductCount: sourceProducts.length,
        createdCount: payload.length,
        skippedCount: targetMerchants.length * sourceProducts.length - payload.length,
      },
      message: "Produk aktif berhasil disalin ke merchant target",
    });
  } catch (error) {
    console.error("[POST /api/admin/merchants/copy-products]", error);
    return NextResponse.json({ success: false, error: "Gagal menyalin produk merchant" }, { status: 500 });
  }
}
