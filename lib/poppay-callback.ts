import { prisma } from "@/src/infra/db/prisma";
import { OrderRepository } from "@/src/infra/db/repositories/order.repository";
import { ExecuteProviderPurchaseService } from "@/src/core/services/provider/execute-provider-purchase.service";
import { InvoiceStatus, OrderStatus, WebhookSource } from "@/src/core/domain/enums/order.enum";
import { PoppayClient } from "@/src/infra/payment/poppay/poppay.client";

export interface PoppayCallbackPayload {
  refid: string;
  agg_refid: string;
  amount: number;
  status: number;
  trx_date?: string;
  [key: string]: unknown;
}

export interface PoppayCallbackResult {
  duplicate: boolean;
  action:
    | "completed_topup"
    | "completed_order"
    | "expired_topup"
    | "expired_order"
    | "failed_topup"
    | "failed_order"
    | "already_completed"
    | "ignored"
    | "not_found"
    | "execute_failed"
    | "inquiry_mismatch";
  orderId?: string;
  topupId?: string;
  executeError?: string;
}

async function confirmCompletedViaInquiry(refId: string): Promise<boolean> {
  try {
    const client = new PoppayClient();
    const inquiry = await client.inquireIncoming(refId);
    return inquiry.status === "completed";
  } catch (error) {
    console.error("[Poppay Callback] Inquiry verification failed:", error);
    return false;
  }
}

function resolveTopupTerminalStatus(status: number): "COMPLETED" | "EXPIRED" | "FAILED" | null {
  if (status === 5) return "COMPLETED";
  if (status === 3) return "EXPIRED";
  if (status === 1 || status === 2 || status === 4) return "FAILED";
  return null;
}

function resolveInvoiceTerminalStatus(status: number): InvoiceStatus | null {
  if (status === 5) return InvoiceStatus.PAID;
  if (status === 3) return InvoiceStatus.EXPIRED;
  if (status === 2) return InvoiceStatus.CANCELLED;
  if (status === 1 || status === 4) return InvoiceStatus.CANCELLED;
  return null;
}

function resolveOrderTerminalStatus(status: number): OrderStatus | null {
  if (status === 5) return OrderStatus.PAID;
  if (status === 3) return OrderStatus.EXPIRED;
  if (status === 1 || status === 2 || status === 4) return OrderStatus.FAILED;
  return null;
}

function resolvePaidAt(trxDate?: string): Date {
  if (!trxDate) return new Date();
  const parsed = new Date(trxDate);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function handlePoppayCallback(
  payload: PoppayCallbackPayload,
  rawPayload: unknown
): Promise<PoppayCallbackResult> {
  const orderRepo = new OrderRepository();
  const eventId = `poppay:${payload.agg_refid}:${payload.status}:${payload.refid}`;
  const { duplicate } = await orderRepo.findOrCreateWebhookEvent({
    source: WebhookSource.POPPAY,
    eventId,
    eventType: String(payload.status),
    payload: rawPayload as Parameters<OrderRepository["findOrCreateWebhookEvent"]>[0]["payload"],
  });

  if (duplicate) {
    return { duplicate: true, action: "ignored" };
  }

  try {
    const paidAt = resolvePaidAt(payload.trx_date);

    if (String(payload.agg_refid).startsWith("WT-")) {
      const result = await handlePoppayTopup(payload, paidAt);
      await orderRepo.markWebhookProcessed(eventId);
      return { duplicate: false, ...result };
    }

    const result = await handlePoppayOrder(payload, paidAt);
    await orderRepo.markWebhookProcessed(eventId);
    return { duplicate: false, ...result };
  } catch (error) {
    await orderRepo.markWebhookProcessed(
      eventId,
      error instanceof Error ? error.message : "Unknown callback error"
    );
    throw error;
  }
}

async function handlePoppayTopup(
  payload: PoppayCallbackPayload,
  paidAt: Date
): Promise<Omit<PoppayCallbackResult, "duplicate">> {
  const topup = await prisma.walletTopup.findUnique({
    where: { topupCode: payload.agg_refid },
  });

  if (!topup) {
    return { action: "not_found" };
  }

  if (topup.status === "COMPLETED") {
    return { action: "already_completed", topupId: topup.id };
  }

  const terminalStatus = resolveTopupTerminalStatus(payload.status);
  if (!terminalStatus) {
    return { action: "ignored", topupId: topup.id };
  }

  if (terminalStatus !== "COMPLETED") {
    await prisma.walletTopup.update({
      where: { id: topup.id },
      data: {
        status: terminalStatus,
        paymentMethod: topup.paymentMethod ?? "qris",
        invoiceId: topup.invoiceId ?? payload.refid,
      },
    });

    return {
      action: terminalStatus === "EXPIRED" ? "expired_topup" : "failed_topup",
      topupId: topup.id,
    };
  }

  const inquiryConfirmed = await confirmCompletedViaInquiry(payload.refid);
  if (!inquiryConfirmed) {
    return { action: "inquiry_mismatch", topupId: topup.id };
  }

  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { userId: topup.userId },
      create: { userId: topup.userId, balance: 0 },
      update: {},
    });

    const balanceBefore = Number(wallet.balance);
    const creditAmount = Number(topup.amount);
    const balanceAfter = balanceBefore + creditAmount;

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount: creditAmount,
        balanceBefore,
        balanceAfter,
        reference: topup.topupCode,
        description: "Top Up Saldo via POPPAY QRIS",
      },
    });

    await tx.walletTopup.update({
      where: { id: topup.id },
      data: {
        status: "COMPLETED",
        paymentMethod: "qris",
        invoiceId: topup.invoiceId ?? payload.refid,
        paidAt,
        fee: Number(topup.fee ?? 0),
        totalPayment: Number(topup.totalPayment ?? topup.amount),
      },
    });
  });

  return { action: "completed_topup", topupId: topup.id };
}

async function handlePoppayOrder(
  payload: PoppayCallbackPayload,
  paidAt: Date
): Promise<Omit<PoppayCallbackResult, "duplicate">> {
  const orderRepo = new OrderRepository();
  const executeService = new ExecuteProviderPurchaseService(orderRepo);
  const order = await orderRepo.findByCode(payload.agg_refid);

  if (!order) {
    return { action: "not_found" };
  }

  if (
    order.status === OrderStatus.PAID ||
    order.status === OrderStatus.PROCESSING_PROVIDER ||
    order.status === OrderStatus.SUCCESS
  ) {
    return { action: "already_completed", orderId: order.id };
  }

  const invoiceStatus = resolveInvoiceTerminalStatus(payload.status);
  const orderStatus = resolveOrderTerminalStatus(payload.status);

  if (!invoiceStatus || !orderStatus) {
    return { action: "ignored", orderId: order.id };
  }

  if (order.paymentInvoice) {
    await prisma.paymentInvoice.update({
      where: { id: order.paymentInvoice.id },
      data: {
        invoiceId: order.paymentInvoice.invoiceId || payload.refid,
        method: order.paymentInvoice.method ?? "qris",
        status: invoiceStatus,
        paidAt: invoiceStatus === InvoiceStatus.PAID ? paidAt : order.paymentInvoice.paidAt,
        rawPayload: rawJson(payload),
      },
    });
  }

  if (orderStatus !== OrderStatus.PAID) {
    await orderRepo.updateStatus(order.id, orderStatus, {
      notes: `POPPAY callback status=${payload.status}`,
    });
    return {
      action: orderStatus === OrderStatus.EXPIRED ? "expired_order" : "failed_order",
      orderId: order.id,
    };
  }

  const inquiryConfirmed = await confirmCompletedViaInquiry(payload.refid);
  if (!inquiryConfirmed) {
    return { action: "inquiry_mismatch", orderId: order.id };
  }

  await orderRepo.updateStatus(order.id, OrderStatus.PAID);

  try {
    await executeService.execute(order.id);
    return { action: "completed_order", orderId: order.id };
  } catch (error) {
    return {
      action: "execute_failed",
      orderId: order.id,
      executeError: error instanceof Error ? error.message : "Unknown execute error",
    };
  }
}

function rawJson(payload: PoppayCallbackPayload) {
  return payload as unknown as NonNullable<
    Parameters<OrderRepository["updateInvoiceStatus"]>[2]
  >["rawPayload"];
}
