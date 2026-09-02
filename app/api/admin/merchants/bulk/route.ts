import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/src/infra/db/prisma";
import { getLogger } from "@/lib/logger";
import { requireAdminVerified } from "@/lib/admin-auth";

const log = getLogger("admin");

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  isActive: z.boolean(),
});


export async function PATCH(request: NextRequest) {
  const auth = await requireAdminVerified();
  if (!auth.ok) return auth.response;

  try {
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

    const result = await prisma.sellerProfile.updateMany({
      where: { id: { in: parsed.data.ids } },
      data: { isActive: parsed.data.isActive },
    });

    return NextResponse.json({
      success: true,
      data: {
        count: result.count,
        isActive: parsed.data.isActive,
      },
    });
  } catch (error) {
    log.error({ err: error }, "admin merchants bulk request failed");
    return NextResponse.json({ success: false, error: "Gagal memperbarui merchant massal" }, { status: 500 });
  }
}
