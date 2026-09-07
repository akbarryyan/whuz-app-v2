/**
 * GET /api/banners
 * Public endpoint — returns banner image URLs for the home carousel.
 */

import { NextResponse } from "next/server";
import { getBannerImages, getSiteConfig, getSiteName } from "@/lib/site-config";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Endpoint katalog publik. Batasnya longgar — penjelajahan manusia yang paling
  // ramai pun jauh di bawahnya — tetapi cukup untuk memotong loop render yang
  // menembak ratusan kali per detik. Itu bukan skenario karangan: satu bug
  // identitas hook pernah membuat halaman toko merchant memanggil endpoint ini
  // sekitar 130 kali per detik per tab, dan tidak ada apa pun yang menahannya.
  const limited = enforceRateLimit(request, "catalog:banners", { limit: 200, windowMs: 60000 });
  if (limited) return limited;

  const [images, tagline, siteName] = await Promise.all([
    getBannerImages(),
    getSiteConfig("banner_tagline"),
    getSiteName(),
  ]);
  return NextResponse.json({
    success: true,
    data: images,
    tagline:
      tagline || `${siteName} - Tempat Top Up Game dan Jual Beli Produk Digital Terpercaya`,
  });
}
