import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/src/infra/db/prisma";
import { getLogger } from "@/lib/logger";
import { requireAdminVerified } from "@/lib/admin-auth";

const log = getLogger("admin");

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  isActive: z.boolean(),
});


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminVerified();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

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

    const merchant = await prisma.sellerProfile.update({
      where: { id },
      data: { isActive: parsed.data.isActive },
      select: {
        id: true,
        isActive: true,
        displayName: true,
        slug: true,
      },
    });

    return NextResponse.json({ success: true, data: merchant });
  } catch (error) {
    log.error({ err: error }, "admin merchants request failed");
    return NextResponse.json({ success: false, error: "Gagal memperbarui merchant" }, { status: 500 });
  }
}
