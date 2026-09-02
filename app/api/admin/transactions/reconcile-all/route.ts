/**
 * POST /api/admin/transactions/reconcile-all
 *
 * Bulk reconcile all stale PROCESSING_PROVIDER / PAID orders.
 * Admin only.
 */

import { NextResponse } from "next/server";
import { ReconcileOrderService } from "@/src/core/services/provider/reconcile-order.service";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";
import { getLogger } from "@/lib/logger";
import { requireAdminVerified } from "@/lib/admin-auth";

const log = getLogger("admin");

export const dynamic = "force-dynamic";

const reconcileService = new ReconcileOrderService(
  new OrderRepository(),
);

export async function POST() {
  const auth = await requireAdminVerified();
  if (!auth.ok) return auth.response;

  try {
    const result = await reconcileService.reconcileStaleOrders();

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    log.error({ err }, "admin transactions reconcile all request failed");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
