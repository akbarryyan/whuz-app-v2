import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/src/infra/db/prisma";

export const dynamic = "force-dynamic";

const UpdateWithdrawalSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PAID", "CANCELLED"]),
  processedNote: z.string().max(1000).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Payload tidak valid" }, { status: 400 });
  }

  const parsed = UpdateWithdrawalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation error", details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.sellerWithdrawalRequest.findUnique({
        where: { id },
      });

      if (!request) throw new Error("Request withdraw tidak ditemukan");
      if (request.status !== "PENDING" && parsed.data.status !== "PAID") {
        throw new Error("Request ini sudah diproses sebelumnya");
      }

      if (parsed.data.status === "REJECTED" || parsed.data.status === "CANCELLED") {
        const wallet = await tx.wallet.findUnique({ where: { userId: request.userId } });
        if (wallet) {
          const balanceBefore = Number(wallet.balance);
          const balanceAfter = balanceBefore + Number(request.amount);

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: new Prisma.Decimal(balanceAfter) },
          });

          await tx.ledgerEntry.create({
            data: {
              walletId: wallet.id,
              type: "WITHDRAW_RELEASE",
              amount: request.amount,
              balanceBefore: new Prisma.Decimal(balanceBefore),
              balanceAfter: new Prisma.Decimal(balanceAfter),
              reference: request.id,
              description: `Release withdraw seller ${request.id}`,
            },
          });
        }
      }

      if (parsed.data.status === "PAID") {
        const wallet = await tx.wallet.findUnique({ where: { userId: request.userId } });
        if (wallet) {
          await tx.ledgerEntry.create({
            data: {
              walletId: wallet.id,
              type: "WITHDRAW_PAID",
              amount: request.amount,
              balanceBefore: wallet.balance,
              balanceAfter: wallet.balance,
              reference: request.id,
              description: `Withdraw seller dibayar ${request.id}`,
            },
          });
        }
      }

      return tx.sellerWithdrawalRequest.update({
        where: { id: request.id },
        data: {
          status: parsed.data.status,
          processedNote: parsed.data.processedNote?.trim() || null,
          processedAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        amount: Number(result.amount),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal memproses withdraw";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
