/**
 * GET  /api/admin/provider-mode  — returns current mode for all providers
 * PATCH /api/admin/provider-mode  — toggle mode for a provider
 *
 * Body: { provider: "DIGIFLAZZ" | "VIP_RESELLER", mode: "MOCK" | "REAL" | null }
 * mode=null resets to env-var default.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ProviderFactory,
  setProviderModeOverride,
  getProviderModeOverrides,
  initProviderModesFromDB,
} from "@/src/infra/providers/provider.factory";
import { ProviderType, ProviderMode } from "@/src/core/domain/enums/provider.enum";
import { requireAdmin, requireAdminVerified } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // Ensure globalThis is synced from DB on every cold-start
  await initProviderModesFromDB();

  const modes = ProviderFactory.getProviderModes();
  const overrides = getProviderModeOverrides();

  return NextResponse.json({
    success: true,
    data: {
      DIGIFLAZZ: {
        effective: modes[ProviderType.DIGIFLAZZ],
        override: overrides[ProviderType.DIGIFLAZZ] ?? null,
        env: process.env.PROVIDER_DIGIFLAZZ_MODE ?? "mock",
      },
      VIP_RESELLER: {
        effective: modes[ProviderType.VIP_RESELLER],
        override: overrides[ProviderType.VIP_RESELLER] ?? null,
        env: process.env.PROVIDER_VIP_MODE ?? "mock",
      },
    },
  });
}

const PatchSchema = z.object({
  provider: z.enum(["DIGIFLAZZ", "VIP_RESELLER"]),
  mode: z.enum(["MOCK", "REAL"]).nullable(),
});

export async function PATCH(request: Request) {
  const auth = await requireAdminVerified();
  if (!auth.ok) return auth.response;

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

  const { provider, mode } = parsed.data;
  // setProviderModeOverride now also persists to DB automatically
  setProviderModeOverride(
    provider as ProviderType,
    mode === null ? null : (mode as ProviderMode)
  );

  const effective = ProviderFactory.getProviderMode(provider as ProviderType);

  return NextResponse.json({
    success: true,
    data: { provider, effective, override: mode },
  });
}

