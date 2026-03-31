import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/infra/db/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/catalog/brands/[brand]/products
 * Return merchant-selected products for a specific brand slug (public, no auth)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  try {
    const { brand: brandSlug } = await params;

    const allSellerProducts = await prisma.sellerProduct.findMany({
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

    const allBrands = Array.from(new Set(allSellerProducts.map((item) => item.product.brand)));

    const matchedBrand = allBrands.find((brand) => {
      const slug = brand
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

    const products = await prisma.sellerProduct.findMany({
      where: {
        isActive: true,
        seller: {
          sellerProfile: {
            isActive: true,
          },
        },
        product: {
          brand: matchedBrand,
          isActive: true,
          stock: true,
        },
      },
      include: {
        product: true,
        seller: {
          select: {
            sellerProfile: {
              select: {
                displayName: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    const productsData = products
      .map((item) => {
        const merchantSellingPrice = item.sellingPrice !== null
          ? Number(item.sellingPrice)
          : Number(item.product.sellingPrice);

        return {
          id: item.product.id,
          sellerProductId: item.id,
          merchantName: item.seller.sellerProfile?.displayName ?? "Merchant",
          merchantSlug: item.seller.sellerProfile?.slug ?? null,
          providerCode: item.product.providerCode,
          name: item.product.name,
          category: item.product.category,
          brand: item.product.brand,
          type: item.product.type,
          providerPrice: Number(item.product.providerPrice),
          sellingPrice: merchantSellingPrice,
          discount: Number(item.product.providerPrice) > merchantSellingPrice
            ? Math.round(((Number(item.product.providerPrice) - merchantSellingPrice) / Number(item.product.providerPrice)) * 100)
            : 0,
          description: item.product.description,
        };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        if (a.sellingPrice !== b.sellingPrice) return a.sellingPrice - b.sellingPrice;
        return a.name.localeCompare(b.name);
      });

    const typeGroups: Record<string, typeof productsData> = {};
    productsData.forEach((p) => {
      if (!typeGroups[p.type]) typeGroups[p.type] = [];
      typeGroups[p.type].push(p);
    });

    const brandMeta = await prisma.brandMeta.findUnique({
      where: { brand: matchedBrand },
      select: { imageUrl: true, inputFields: true },
    });

    return NextResponse.json({
      success: true,
      brand: matchedBrand,
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
