/**
 * GET /api/promos
 * Public endpoint — returns active promos, sorted by sortOrder then createdAt.
 * Filters out promos whose endDate has passed.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/src/infra/db/prisma";
import { getSiteConfig } from "@/lib/site-config";
import { getLogger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";

const log = getLogger("catalog");

export const dynamic = "force-dynamic";

const DEFAULT_HERO_IMAGE =
  "https://www.vcgamers.com/_next/static/media/image-percent.4146a3ec.png";

export async function GET(request: Request) {
  // Endpoint katalog publik. Batasnya longgar — penjelajahan manusia yang paling
  // ramai pun jauh di bawahnya — tetapi cukup untuk memotong loop render yang
  // menembak ratusan kali per detik. Itu bukan skenario karangan: satu bug
  // identitas hook pernah membuat halaman toko merchant memanggil endpoint ini
  // sekitar 130 kali per detik per tab, dan tidak ada apa pun yang menahannya.
  const limited = enforceRateLimit(request, "catalog:promos", { limit: 200, windowMs: 60000 });
  if (limited) return limited;

  try {
    const now = new Date();
    const [promos, heroImageUrl] = await Promise.all([
      prisma.promo.findMany({
      where: {
        isActive: true,
        OR: [
          { endDate: null },
          { endDate: { gte: now } },
        ],
      },
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        linkUrl: true,
        startDate: true,
        endDate: true,
      },
    }),
      getSiteConfig("promo_hero_image_url"),
    ]);

    return NextResponse.json({
      success: true,
      data: promos,
      heroImageUrl: heroImageUrl ?? DEFAULT_HERO_IMAGE,
    });
  } catch (err) {
    log.error({ err }, "promos request failed");
    return NextResponse.json({ success: false, error: "Gagal memuat promo." }, { status: 500 });
  }
}
