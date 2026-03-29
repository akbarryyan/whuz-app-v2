import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/infra/db/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/catalog/brands/[brand]/products
 * Return all active products for a specific brand slug (public, no auth)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  try {
    const { brand: brandSlug } = await params;

    // Cari semua brand yang ada, lalu cocokkan slug
    const allBrands = await prisma.product.findMany({
      where: { isActive: true, stock: true },
      select: { brand: true },
      distinct: ["brand"],
    });

    const matchedBrand = allBrands.find((b) => {
      const slug = b.brand
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      return slug === brandSlug;
    });

    if (!matchedBrand) {
      return NextResponse.json(
        { success: false, error: "Brand tidak ditemukan." },
        { status: 404 }
      );
    }

    const products = await prisma.product.findMany({
      where: {
        brand: matchedBrand.brand,
        isActive: true,
        stock: true,
      },
      orderBy: [{ type: "asc" }, { sellingPrice: "asc" }],
      select: {
        id: true,
        providerCode: true,
        name: true,
        category: true,
        brand: true,
        type: true,
        providerPrice: true,
        sellingPrice: true,
        description: true,
      },
    });

    // Group products by type for tab filters
    const typeGroups: Record<string, typeof productsData> = {};
    const productsData = products.map((p) => ({
      id: p.id,
      providerCode: p.providerCode,
      name: p.name,
      category: p.category,
      brand: p.brand,
      type: p.type,
      providerPrice: Number(p.providerPrice),
      sellingPrice: Number(p.sellingPrice),
      discount: Number(p.providerPrice) > Number(p.sellingPrice)
        ? Math.round(((Number(p.providerPrice) - Number(p.sellingPrice)) / Number(p.providerPrice)) * 100)
        : 0,
      description: p.description,
    }));

    productsData.forEach((p) => {
      if (!typeGroups[p.type]) typeGroups[p.type] = [];
      typeGroups[p.type].push(p);
    });

    const brandMeta = await prisma.brandMeta.findUnique({
      where: { brand: matchedBrand.brand },
      select: { imageUrl: true, inputFields: true },
    });

    return NextResponse.json({
      success: true,
      brand: matchedBrand.brand,
      imageUrl: brandMeta?.imageUrl ?? null,
      inputFields: brandMeta?.inputFields ?? null,
      types: Object.keys(typeGroups),
      data: productsData,
      grouped: typeGroups,
    });
  } catch (error) {
    console.error("[CATALOG BRAND PRODUCTS ERROR]", error);
    return NextResponse.json(
      { success: false, error: "Gagal memuat produk." },
      { status: 500 }
    );
  }
}
