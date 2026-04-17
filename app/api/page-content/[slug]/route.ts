/**
 * GET /api/page-content/[slug]
 * Public endpoint — returns rich-text HTML content for a given page slug.
 */

import { NextResponse } from "next/server";
import { getAllSiteConfig, getSiteConfig } from "@/lib/site-config";
import { FooterLinkItem, findFooterPageBySlug, normalizeFooterLinks } from "@/lib/footer-links";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const key = `page_content_${slug}`;

  try {
    const [content, rawConfig] = await Promise.all([
      getSiteConfig(key),
      getAllSiteConfig(),
    ]);
    const infoLinks = normalizeFooterLinks(
      JSON.parse(rawConfig.footer_info_links ?? "[]") as FooterLinkItem[],
      []
    );
    const otherLinks = normalizeFooterLinks(
      JSON.parse(rawConfig.footer_other_links ?? "[]") as FooterLinkItem[],
      []
    );
    const pageMeta = findFooterPageBySlug(slug, infoLinks, otherLinks);
    return NextResponse.json({
      success: true,
      data: { slug, title: pageMeta?.label ?? null, content: content ?? "" },
    });
  } catch (err) {
    console.error(`[GET /api/page-content/${slug}]`, err);
    return NextResponse.json({
      success: true,
      data: { slug, title: null, content: "" },
    });
  }
}
