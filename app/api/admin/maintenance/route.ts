import { NextResponse } from "next/server";
import { requireAdmin, requireAdminVerified } from "@/lib/admin-auth";
import { getSiteConfig, setSiteConfig } from "@/lib/site-config";
import { cookies } from "next/headers";
import { getLogger } from "@/lib/logger";

const log = getLogger("admin");

const KEY = "MAINTENANCE_MODE";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const val = await getSiteConfig(KEY);
    return NextResponse.json({ success: true, enabled: val === "1" });
  } catch (err) {
    log.error({ err }, "admin maintenance request failed");
    return NextResponse.json({ success: false, enabled: false }, { status: 500 });
  }
}

export async function PATCH() {
  const auth = await requireAdminVerified();
  if (!auth.ok) return auth.response;

  try {
    const current = await getSiteConfig(KEY);
    const next = current === "1" ? "0" : "1";
    await setSiteConfig(KEY, next);

    // Set or clear the _maint cookie so middleware can read it cheaply
    const cookieStore = await cookies();
    if (next === "1") {
      cookieStore.set("_maint", "1", {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    } else {
      cookieStore.set("_maint", "", {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: 0,
      });
    }

    return NextResponse.json({ success: true, enabled: next === "1" });
  } catch (err) {
    log.error({ err }, "admin maintenance request failed");
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
