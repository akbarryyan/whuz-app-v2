/**
 * GET /api/flash-sale
 * Public endpoint — returns flash sale config for the home page.
 */

import { NextResponse } from "next/server";
import { getFlashSaleConfig } from "@/lib/site-config";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Endpoint katalog publik. Batasnya longgar — penjelajahan manusia yang paling
  // ramai pun jauh di bawahnya — tetapi cukup untuk memotong loop render yang
  // menembak ratusan kali per detik. Itu bukan skenario karangan: satu bug
  // identitas hook pernah membuat halaman toko merchant memanggil endpoint ini
  // sekitar 130 kali per detik per tab, dan tidak ada apa pun yang menahannya.
  const limited = enforceRateLimit(request, "catalog:flash-sale", { limit: 200, windowMs: 60000 });
  if (limited) return limited;

  const config = await getFlashSaleConfig();
  return NextResponse.json({ success: true, data: config });
}
