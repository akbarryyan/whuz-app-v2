import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/infra/db/prisma";
import { getLogger } from "@/lib/logger";
import { requireAdmin } from "@/lib/admin-auth";

const log = getLogger("admin");

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

    const merchants = await prisma.sellerProfile.findMany({
      where: q
        ? {
            OR: [
              { displayName: { contains: q } },
              { slug: { contains: q } },
              { description: { contains: q } },
              { user: { is: { name: { contains: q } } } },
              { user: { is: { email: { contains: q } } } },
              { user: { is: { phone: { contains: q } } } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        slug: true,
        displayName: true,
        description: true,
        profileImageUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
            wallet: {
              select: {
                balance: true,
              },
            },
            sellerProducts: {
              where: { isActive: true },
              select: { id: true },
            },
            _count: {
              select: {
                sellerProducts: true,
                sellerOrders: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: merchants.map((merchant) => ({
        ...merchant,
        user: {
          ...merchant.user,
          walletBalance: merchant.user.wallet ? Number(merchant.user.wallet.balance) : 0,
        },
        activeSellerProductsCount: merchant.user.sellerProducts.length,
      })),
    });
  } catch (error) {
    log.error({ err: error }, "admin merchants request failed");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
