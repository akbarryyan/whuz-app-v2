import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/infra/db/prisma";
import { getLogger } from "@/lib/logger";
import { requireAdmin } from "@/lib/admin-auth";

const log = getLogger("admin");

export const dynamic = "force-dynamic";


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        tier: {
          select: {
            id: true,
            name: true,
            label: true,
            marginMultiplier: true,
          },
        },
        wallet: { select: { balance: true } },
        _count: {
          select: {
            orders: true,
            sellerProducts: true,
            sellerOrders: true,
          },
        },
        sellerProfile: {
          select: {
            id: true,
            slug: true,
            displayName: true,
            isActive: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        tier: user.tier
          ? { ...user.tier, marginMultiplier: Number(user.tier.marginMultiplier) }
          : null,
        walletBalance: user.wallet ? Number(user.wallet.balance) : 0,
      },
    });
  } catch (error) {
    log.error({ err: error }, "admin users request failed");
    return NextResponse.json({ success: false, error: "Gagal mengambil detail user" }, { status: 500 });
  }
}
