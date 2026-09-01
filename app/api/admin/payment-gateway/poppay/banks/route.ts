import { NextRequest, NextResponse } from "next/server";
import { isPoppayConfigured, PoppayClient } from "@/src/infra/payment/poppay/poppay.client";
import { getLogger } from "@/lib/logger";

const log = getLogger("admin");

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!(await isPoppayConfigured())) {
      return NextResponse.json(
        {
          success: false,
          error: "Poppay belum terkonfigurasi di environment.",
          requiredEnv: [
            "POPPAY_API_BASE_URL atau POPPAY_URL + POPPAY_PORT",
            "POPPAY_VERSION",
            "POPPAY_INTEGRATOR_TOKEN",
          ],
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const start = Number(searchParams.get("start") ?? "0");
    const length = Number(searchParams.get("length") ?? "50");
    const currency = (searchParams.get("currency") ?? "IDR").trim();

    const client = new PoppayClient();
    const data = await client.listBanks({
      start: Number.isFinite(start) ? start : 0,
      length: Number.isFinite(length) ? length : 50,
      filters: currency ? [{ key: "c", value: currency }] : undefined,
    });

    return NextResponse.json({
      success: true,
      gateway: "POPPAY",
      data,
    });
  } catch (error) {
    log.error({ err: error }, "admin payment gateway poppay banks request failed");
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Gagal mengambil bank list dari Poppay.",
      },
      { status: 502 }
    );
  }
}
