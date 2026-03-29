import { NextResponse } from "next/server";
import { getSiteConfig } from "@/lib/site-config";

/**
 * GET /api/site-branding — public endpoint returning site identity (logo, name, etc.)
 */
export async function GET() {
  const [siteName, siteLogo] = await Promise.all([
    getSiteConfig("site_name"),
    getSiteConfig("site_logo"),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      site_name: siteName || "Whuzpay",
      site_logo: siteLogo || "",
    },
  });
}
