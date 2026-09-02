import { NextRequest, NextResponse } from "next/server";
import { ProviderManagementService } from "@/src/core/services/provider/provider-management.service";
import { ProviderType } from "@/src/core/domain/enums/provider.enum";
import { getLogger } from "@/lib/logger";
import { requireAdminVerified } from "@/lib/admin-auth";

const log = getLogger("admin");

const providerService = new ProviderManagementService();

/**
 * POST /api/admin/providers/[type]/check-balance
 * On-demand balance check for specific provider
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const auth = await requireAdminVerified();
  if (!auth.ok) return auth.response;

  try {
    const { type } = await params;
    const provider = type.toUpperCase() as ProviderType;

    // Validate provider
    if (!Object.values(ProviderType).includes(provider)) {
      return NextResponse.json(
        { success: false, error: "Invalid provider type" },
        { status: 400 }
      );
    }

    // Check balance
    const result = await providerService.checkProviderBalance(provider);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    log.error({ err: error }, "check balance error");
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || "Failed to check balance" 
      },
      { status: 500 }
    );
  }
}
