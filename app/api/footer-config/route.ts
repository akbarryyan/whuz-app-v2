/**
 * GET /api/footer-config
 * Public endpoint — returns footer configuration with defaults fallback.
 */

import { NextResponse } from "next/server";
import { getAllSiteConfig } from "@/lib/site-config";
import { getFooterVisitorStats } from "@/lib/analytics";
import { DEFAULT_FOOTER_COLUMNS } from "@/lib/footer-columns";

export const dynamic = "force-dynamic";

export const FOOTER_DEFAULTS = {
  footer_logo_url: "",
  footer_tagline: "Top Up Game Murah & PPOB Terpercaya? Whuzpay Aja!",
  footer_payment_methods: JSON.stringify([
    { name: "GoPay",  img: "" },
    { name: "DANA",   img: "" },
    { name: "Shopee", img: "" },
    { name: "OVO",    img: "" },
    { name: "QRIS",   img: "" },
  ]),
  footer_company_name: "PT Whuzpay Digital Indonesia",
  footer_contact_phone: "08123-456-7890",
  footer_contact_email: "support@whuzpay.com",
  footer_info_links: JSON.stringify([
    { label: "Tentang Kami",          type: "page", slug: "tentang-kami", href: "/info/tentang-kami" },
    { label: "Syarat dan Ketentuan",  type: "page", slug: "syarat-dan-ketentuan", href: "/info/syarat-dan-ketentuan" },
    { label: "Kebijakan Privasi",     type: "page", slug: "kebijakan-privasi", href: "/info/kebijakan-privasi" },
  ]),
  footer_other_links: JSON.stringify([
    { label: "Karir", type: "page", slug: "karir", href: "/info/karir" },
  ]),
  footer_columns: JSON.stringify(DEFAULT_FOOTER_COLUMNS),
  footer_social_links: JSON.stringify([
    { platform: "instagram", href: "#" },
    { platform: "facebook",  href: "#" },
    { platform: "youtube",   href: "#" },
    { platform: "discord",   href: "#" },
    { platform: "tiktok",    href: "#" },
  ]),
  footer_copyright: "Copyright ©2024 - 2026\nPT. Whuzpay Digital Indonesia - Whuzpay All Right Reserved",
};

export async function GET() {
  try {
    const [raw, visitorStats] = await Promise.all([
      getAllSiteConfig(),
      getFooterVisitorStats(),
    ]);

    // Merge DB values over defaults
    const config: Record<string, string> = { ...FOOTER_DEFAULTS };
    for (const key of Object.keys(FOOTER_DEFAULTS)) {
      if (raw[key] != null) config[key] = raw[key];
    }

    return NextResponse.json({
      success: true,
      data: {
        ...config,
        visitorStats,
      },
    });
  } catch (err) {
    console.error("[GET /api/footer-config]", err);
    return NextResponse.json({
      success: true,
      data: {
        ...FOOTER_DEFAULTS,
        visitorStats: {
          visitorsToday: 0,
          totalVisits: 0,
          pagesToday: 0,
        },
      },
    });
  }
}
