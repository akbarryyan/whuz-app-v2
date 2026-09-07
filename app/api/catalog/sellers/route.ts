import { NextResponse } from "next/server";
import { prisma } from "@/src/infra/db/prisma";
import { getLogger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";

const log = getLogger("catalog");

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Endpoint katalog publik. Batasnya longgar — penjelajahan manusia yang paling
  // ramai pun jauh di bawahnya — tetapi cukup untuk memotong loop render yang
  // menembak ratusan kali per detik. Itu bukan skenario karangan: satu bug
  // identitas hook pernah membuat halaman toko merchant memanggil endpoint ini
  // sekitar 130 kali per detik per tab, dan tidak ada apa pun yang menahannya.
  const limited = enforceRateLimit(request, "catalog:sellers", { limit: 200, windowMs: 60000 });
  if (limited) return limited;

  try {
    const sellers = await prisma.sellerProfile.findMany({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        displayName: true,
        description: true,
        profileImageUrl: true,
        userId: true,
      },
      orderBy: { displayName: "asc" },
    });

    const sellerIds = sellers.map((seller) => seller.userId);
    const sellerProducts = await prisma.sellerProduct.findMany({
      where: {
        sellerId: { in: sellerIds },
        isActive: true,
        product: {
          isActive: true,
          stock: true,
        },
      },
      select: {
        sellerId: true,
        product: {
          select: {
            brand: true,
          },
        },
      },
    });

    const grouped = new Map<string, { productCount: number; brands: Set<string> }>();
    for (const item of sellerProducts) {
      if (!grouped.has(item.sellerId)) {
        grouped.set(item.sellerId, { productCount: 0, brands: new Set<string>() });
      }
      const bucket = grouped.get(item.sellerId)!;
      bucket.productCount += 1;
      bucket.brands.add(item.product.brand);
    }

    const data = sellers
      .map((seller) => {
        const stats = grouped.get(seller.userId);
        return {
          id: seller.id,
          slug: seller.slug,
          displayName: seller.displayName,
          description: seller.description,
          profileImageUrl: seller.profileImageUrl,
          productCount: stats?.productCount ?? 0,
          brandCount: stats?.brands.size ?? 0,
        };
      })
      .filter((seller) => seller.productCount > 0);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    log.error({ err: error }, "catalog sellers request failed");
    return NextResponse.json(
      { success: false, error: "Gagal memuat merchant." },
      { status: 500 }
    );
  }
}
