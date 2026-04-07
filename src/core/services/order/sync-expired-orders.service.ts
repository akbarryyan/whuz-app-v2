import { prisma } from "@/src/infra/db/prisma";
import { InvoiceStatus, OrderStatus } from "@/src/core/domain/enums/order.enum";

const EXPIRE_NOTE = "Pembayaran kedaluwarsa otomatis karena melewati batas waktu QRIS.";

async function expireOrdersByIds(orderIds: string[]) {
  if (orderIds.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.paymentInvoice.updateMany({
      where: {
        orderId: { in: orderIds },
        status: InvoiceStatus.PENDING,
        paidAt: null,
      },
      data: {
        status: InvoiceStatus.EXPIRED,
      },
    });

    await tx.order.updateMany({
      where: {
        id: { in: orderIds },
        status: OrderStatus.WAITING_PAYMENT,
      },
      data: {
        status: OrderStatus.EXPIRED,
        notes: EXPIRE_NOTE,
      },
    });
  });

  return orderIds.length;
}

export async function syncExpiredOrdersForUser(userId: string) {
  const expiredOrders = await prisma.order.findMany({
    where: {
      userId,
      status: OrderStatus.WAITING_PAYMENT,
      paymentInvoice: {
        is: {
          status: InvoiceStatus.PENDING,
          paidAt: null,
          expiredAt: { lt: new Date() },
        },
      },
    },
    select: { id: true },
  });

  return expireOrdersByIds(expiredOrders.map((order) => order.id));
}

export async function syncExpiredOrderByCode(orderCode: string) {
  const expiredOrder = await prisma.order.findFirst({
    where: {
      orderCode,
      status: OrderStatus.WAITING_PAYMENT,
      paymentInvoice: {
        is: {
          status: InvoiceStatus.PENDING,
          paidAt: null,
          expiredAt: { lt: new Date() },
        },
      },
    },
    select: { id: true },
  });

  if (!expiredOrder) return 0;
  return expireOrdersByIds([expiredOrder.id]);
}
