import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/infra/db/prisma";

export const dynamic = "force-dynamic";

// Maps frontend tab key → actual product `type` values in DB
const TYPE_GROUP_MAP: Record<string, string[]> = {
  game:    ["game"],
  pulsa:   ["paket-internet", "paket-telepon", "pulsa-reguler", "pulsa-transfer", "pulsa-internasional", "paket-lainnya"],
  ewallet: ["saldo-emoney"],
  listrik: ["token-pln"],
};

/**
 * GET /api/catalog/brands?typeGroup=game
 * Return distinct brands from active merchant-selected products.
 * Optional ?typeGroup= to filter by product type group.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeGroup = searchParams.get("typeGroup") ?? undefined;
    const types = typeGroup ? TYPE_GROUP_MAP[typeGroup] : undefined;

    const sellerProducts = await prisma.sellerProduct.findMany({
      where: {
        isActive: true,
        seller: {
          sellerProfile: {
            isActive: true,
          },
        },
        product: {
          isActive: true,
          stock: true,
          ...(types ? { type: { in: types } } : {}),
        },
      },
      select: {
        product: {
          select: {
            brand: true,
          },
        },
      },
    });

    const brandCounts = new Map<string, number>();
    for (const item of sellerProducts) {
      const key = item.product.brand;
      brandCounts.set(key, (brandCounts.get(key) ?? 0) + 1);
    }

    const brandNames = Array.from(brandCounts.keys()).sort((a, b) => a.localeCompare(b));

    const metas = await prisma.brandMeta.findMany({
      where: { brand: { in: brandNames } },
      select: { brand: true, imageUrl: true },
    });
    const metaMap: Record<string, { imageUrl: string | null }> = {};
    for (const m of metas) metaMap[m.brand] = { imageUrl: m.imageUrl ?? null };

    const data = brandNames.map((brand) => ({
      brand,
      slug: brand
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      productCount: brandCounts.get(brand) ?? 0,
      imageUrl: metaMap[brand]?.imageUrl ?? null,
    }));

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[CATALOG BRANDS ERROR]", error);
    return NextResponse.json(
      { success: false, error: "Gagal memuat data brand." },
      { status: 500 }
    );
  }
}
