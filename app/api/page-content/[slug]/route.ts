/**
 * GET /api/page-content/[slug]
 * Public endpoint — returns rich-text HTML content for a given page slug.
 */

import { NextResponse } from "next/server";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const key = `page_content_${slug}`;

  try {
    const content = await getSiteConfig(key);
    return NextResponse.json({
      success: true,
      data: { slug, content: content ?? "" },
    });
  } catch (err) {
    console.error(`[GET /api/page-content/${slug}]`, err);
    return NextResponse.json({
      success: true,
      data: { slug, content: "" },
    });
  }
}
