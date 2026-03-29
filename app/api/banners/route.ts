/**
 * GET /api/banners
 * Public endpoint — returns banner image URLs for the home carousel.
 */

import { NextResponse } from "next/server";
import { getBannerImages, getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

const DEFAULT_TAGLINE = "Whuzpay - Tempat Top Up Game dan Jual Beli Produk Digital Terpercaya";

export async function GET() {
  const [images, tagline] = await Promise.all([
    getBannerImages(),
    getSiteConfig("banner_tagline"),
  ]);
  return NextResponse.json({
    success: true,
    data: images,
    tagline: tagline || DEFAULT_TAGLINE,
  });
}
