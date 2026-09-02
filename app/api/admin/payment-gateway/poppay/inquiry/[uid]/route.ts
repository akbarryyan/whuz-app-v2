import { NextResponse } from "next/server";
import { isPoppayConfigured, PoppayClient } from "@/src/infra/payment/poppay/poppay.client";
import { getLogger } from "@/lib/logger";
import { requireAdmin } from "@/lib/admin-auth";

const log = getLogger("admin");

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    if (!(await isPoppayConfigured())) {
      return NextResponse.json(
        {
          success: false,
          error: "Poppay belum terkonfigurasi di environment/database.",
        },
        { status: 400 }
      );
    }

    const { uid } = await params;
    const client = new PoppayClient();
    const data = await client.inquireIncoming(uid);

    return NextResponse.json({
      success: true,
      gateway: "POPPAY",
      data,
      note:
        data.status === "unknown"
          ? "Respons inquiry Poppay belum cukup jelas untuk dipetakan ke status internal. Perlu contoh respons real saat paid/pending."
          : undefined,
    });
  } catch (error) {
    log.error({ err: error }, "admin payment gateway poppay inquiry request failed");
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Gagal inquiry transaksi Poppay.",
      },
      { status: 502 }
    );
  }
}
