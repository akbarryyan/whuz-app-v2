/**
 * GET  /api/admin/site-config  — returns all site config values + effective provider modes
 * PATCH /api/admin/site-config — upsert one config key
 * DELETE /api/admin/site-config?key=... — reset key to env/default
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAllSiteConfig,
  setSiteConfig,
  deleteSiteConfig,
  getAllProviderModes,
  invalidateSiteConfigCache,
} from "@/lib/site-config";
import { initProviderModesFromDB } from "@/src/infra/providers/provider.factory";

export const dynamic = "force-dynamic";

export async function GET() {
  // Sync in-memory ProviderFactory from DB on each admin page load
  await initProviderModesFromDB();

  const [raw, modes] = await Promise.all([
    getAllSiteConfig(),
    getAllProviderModes(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      raw,          // all raw key→value pairs
      modes,        // effective resolved modes (DB > env > default)
      envDefaults: {
        PROVIDER_DIGIFLAZZ_MODE: process.env.PROVIDER_DIGIFLAZZ_MODE ?? "mock",
        PROVIDER_VIP_MODE: process.env.PROVIDER_VIP_MODE ?? "mock",
        PROVIDER_PAKASIR_MODE: process.env.PROVIDER_PAKASIR_MODE ?? "sandbox",
      },
    },
  });
}

const PatchSchema = z.object({
  key: z.string().min(1),
  value: z.string(),  // allow empty — empty value will delete the key (revert to .env default)
});

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation error", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  // If value is empty, delete the key so it falls back to .env default
  if (parsed.data.value === "") {
    await deleteSiteConfig(parsed.data.key);
  } else {
    await setSiteConfig(parsed.data.key, parsed.data.value);
  }

  // Also sync ProviderFactory globalThis so it takes effect immediately
  await initProviderModesFromDB();

  const modes = await getAllProviderModes();
  return NextResponse.json({ success: true, data: { key: parsed.data.key, value: parsed.data.value, modes } });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ success: false, error: "key is required" }, { status: 400 });
  }

  await deleteSiteConfig(key);
  invalidateSiteConfigCache();
  await initProviderModesFromDB();

  const modes = await getAllProviderModes();
  return NextResponse.json({ success: true, data: { key, modes } });
}
