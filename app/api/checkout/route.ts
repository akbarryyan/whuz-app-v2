/**
 * POST /api/checkout
 *
 * Rule: Route handler only parses input, validates with Zod, calls service, returns response.
 * No business logic here — voucher diresolusi & diklaim di dalam service.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { CreateCheckoutService } from "@/src/core/services/checkout/create-checkout.service";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";
import { PoppayAdapter } from "@/src/infra/payment/poppay/poppay.adapter";
import { isPoppayConfigured } from "@/src/infra/payment/poppay/poppay.client";
import { getSession } from "@/lib/session";
import {
  ValidationError,
  GuestWalletError,
  InsufficientBalanceError,
  NotFoundError,
} from "@/src/core/domain/errors/domain.errors";
import { isLoginRequiredForPurchase } from "@/lib/auth-config";
import { getLogger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";

const log = getLogger("order");

export const dynamic = "force-dynamic";

const CheckoutSchema = z.object({
  productId: z.string().min(1),
  sellerProductId: z.string().min(1).optional(),
  targetNumber: z.string().min(1),
  targetData: z.record(z.string(), z.any()).optional(),
  whatsapp: z.string().max(20).optional(),
  paymentMethod: z.enum(["WALLET", "PAYMENT_GATEWAY"]),
  paymentGatewayMethod: z.string().optional(),
  redirectUrl: z.string().url().optional(),
  voucherCode: z.string().max(50).optional(),
});

export async function POST(request: Request) {
  // Pembuatan order massal; tiap order memanggil gateway pembayaran.
  const limited = enforceRateLimit(request, "checkout", { limit: 20, windowMs: 60000 });
  if (limited) return limited;

  try {
    // ── 1. Parse body ──────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    // ── 2. Validate ────────────────────────────────────────────────────────
    const parsed = CheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    // ── 3. Get user session (null for guest) ───────────────────────────────
    const session = await getSession();
    const userId = session.isLoggedIn && session.userId ? session.userId : null;

    if (await isLoginRequiredForPurchase() && !userId) {
      return NextResponse.json(
        { success: false, error: "Kamu harus login terlebih dahulu untuk melakukan pembelian." },
        { status: 401 }
      );
    }

    if (parsed.data.paymentMethod === "PAYMENT_GATEWAY" && !(await isPoppayConfigured())) {
      return NextResponse.json(
        {
          success: false,
          error: "Poppay belum terkonfigurasi lengkap. Isi URL/API base, version, integrator token, aggregator code, dan merchant account number di Admin Settings.",
        },
        { status: 400 }
      );
    }

    // ── 4. Buat Poppay adapter ─────────────────────────────────────────────
    const paymentGateway = new PoppayAdapter();

    // ── 5. Call service ────────────────────────────────────────────────────
    const checkoutService = new CreateCheckoutService(
      new OrderRepository(),
      paymentGateway,
    );

    // Voucher diresolusi dan diklaim di dalam service, di titik ketika nilai
    // yang benar-benar ditagihkan sudah diketahui.
    const result = await checkoutService.execute({ ...parsed.data, userId });

    return NextResponse.json(
      { success: true, data: result, mode: "poppay" },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ValidationError || err instanceof GuestWalletError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    if (err instanceof NotFoundError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    if (err instanceof InsufficientBalanceError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 422 });
    }

    log.error({ err }, "checkout request failed");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
