import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/infra/db/prisma";
import { getSiteConfig } from "@/lib/site-config";

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
 * Return distinct brands with product count + imageUrl from BrandMeta (public, no auth)
 * Only active products with stock.
 * Optional ?typeGroup= to filter by product type group.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeGroup = searchParams.get("typeGroup") ?? undefined;
    const types = typeGroup ? TYPE_GROUP_MAP[typeGroup] : undefined;

    const where: Parameters<typeof prisma.product.groupBy>[0]["where"] = {
      isActive: true,
      stock: true,
      ...(types ? { type: { in: types } } : {}),
    };

    const brands = await prisma.product.groupBy({
      by: ["brand"],
      where,
      _count: { id: true },
      orderBy: { brand: "asc" },
    });

    // Fetch brand imageUrls from BrandMeta in one query
    const brandNames = brands.map((b) => b.brand);
    const [metas, globalBorderImageUrl] = await Promise.all([
      prisma.brandMeta.findMany({
        where: { brand: { in: brandNames } },
        select: { brand: true, imageUrl: true },
      }),
      getSiteConfig("HOME_GAME_GRID_BORDER_IMAGE_URL"),
    ]);
    const metaMap: Record<string, { imageUrl: string | null }> = {};
    for (const m of metas) metaMap[m.brand] = { imageUrl: m.imageUrl ?? null };

    const data = brands.map((b) => ({
      brand: b.brand,
      slug: b.brand
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      productCount: b._count.id,
      imageUrl: metaMap[b.brand]?.imageUrl ?? null,
    }));

    return NextResponse.json({
      success: true,
      data,
      globalBorderImageUrl: globalBorderImageUrl || null,
    });
  } catch (error) {
    console.error("[CATALOG BRANDS ERROR]", error);
    return NextResponse.json(
      { success: false, error: "Gagal memuat data brand." },
      { status: 500 }
    );
  }
}
