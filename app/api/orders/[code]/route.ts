/**
 * GET /api/orders/[code]?token=<viewToken>
 *
 * Supports:
 * - owner/admin access via session
 * - legacy guest deep-link access via token
 * - public code lookup without login/token
 *
 * Rule: No business logic — parse/validate/query/respond.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";
import { getSession } from "@/lib/session";
import { syncExpiredOrderByCode } from "@/src/core/services/order/sync-expired-orders.service";
import { autoReconcileOrderNow } from "@/src/core/services/provider/reconcile-scheduler.service";
import { getLogger } from "@/lib/logger";

const log = getLogger("order");

export const dynamic = "force-dynamic";

const orderRepo = new OrderRepository();

/**
 * `081234567890` -> `0812****7890`. Cukup bagi pemilik untuk mengenali nomornya
 * sendiri, tapi tidak cukup untuk dipanen orang lain.
 */
function maskTarget(value: string): string {
  const v = value.trim();
  if (v.length <= 6) return `${v.slice(0, 1)}${"*".repeat(Math.max(2, v.length - 1))}`;
  const keepTail = v.length >= 10 ? 4 : 2;
  return `${v.slice(0, 4)}${"*".repeat(v.length - 4 - keepTail)}${v.slice(-keepTail)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { searchParams } = new URL(request.url);
    const rawToken = searchParams.get("token");

    await syncExpiredOrderByCode(code);

    // ── Fetch order ────────────────────────────────────────────────────────
    let order = await orderRepo.findByCode(code);

    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    // ── Access control ─────────────────────────────────────────────────────
    // Endpoint ini memang boleh diakses tanpa login dan tanpa token: halaman
    // "Lacak Pesanan" (app/transaksi/page.tsx) hanya berbekal orderCode.
    // Jadi pertanyaannya bukan boleh atau tidak boleh mengakses, melainkan
    // SEBERAPA BANYAK yang boleh dilihat — lihat pembentukan respons di bawah.
    const session = await getSession();
    const sessionUserId = session.isLoggedIn ? session.userId : null;

    let tokenValid = false;
    if (rawToken) {
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      tokenValid = Boolean(order.viewTokenHash) && order.viewTokenHash === tokenHash;

      // Token dikirim tapi salah tetap ditolak keras, seperti sebelumnya.
      if (!tokenValid) {
        return NextResponse.json({ success: false, error: "Invalid token" }, { status: 403 });
      }
    }

    const isAdmin = session.role === "ADMIN";
    const isOwner = Boolean(order.userId) && sessionUserId === order.userId;
    const isAuthorized = isAdmin || isOwner || tokenValid;

    if (order.status === "PAID" || order.status === "PROCESSING_PROVIDER") {
      const reconciled = await autoReconcileOrderNow(order.id);
      if (reconciled) {
        order = reconciled;
      }
    }

    // ── Shape response ─────────────────────────────────────────────────────
    // Pemanggil tanpa kredensial (bukan pemilik, bukan admin, tanpa token)
    // hanya mendapat data pelacakan.
    //
    // serialNumber DITAHAN karena itu kode voucher yang benar-benar bisa
    // ditukar. orderCode hanya `WP-YYMMDD-` + 3 byte acak (lihat
    // create-checkout.service.ts) dan tidak ada rate limit di aplikasi ini,
    // sehingga menyisir kode tanpa penahanan ini sama dengan memanen voucher.
    //
    // targetNumber disamarkan karena itu PII pembeli lain, dan targetData
    // ditiadakan karena memuat ID game / nomor pelanggan.
    //
    // basePrice dan markup tidak lagi dikirim ke siapa pun: tidak dipakai UI
    // mana pun dan isinya margin internal.
    const base = {
      orderCode: order.orderCode,
      status: order.status,
      product: {
        name: order.product.name,
        category: order.product.category,
        brand: order.product.brand,
      },
      notes: order.notes ?? null,
      amount: Number(order.amount),
      fee: Number(order.fee),
      paymentMethod: order.paymentMethod,
      paymentInvoice: order.paymentInvoice
        ? {
            status: order.paymentInvoice.status,
            paymentUrl: order.paymentInvoice.paymentUrl,
            paymentNumber: order.paymentInvoice.paymentNumber,
            method: order.paymentInvoice.method,
            expiredAt: order.paymentInvoice.expiredAt,
            paidAt: order.paymentInvoice.paidAt,
          }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

    if (!isAuthorized) {
      return NextResponse.json({
        success: true,
        data: {
          ...base,
          targetNumber: maskTarget(order.targetNumber),
          targetData: null,
          serialNumber: null,
          // Dipakai UI untuk menjelaskan kenapa detailnya tidak lengkap.
          restricted: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...base,
        targetNumber: order.targetNumber,
        targetData: order.targetData,
        serialNumber: order.serialNumber ?? null,
        restricted: false,
      },
    });
  } catch (err) {
    log.error({ err }, "orders request failed");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
