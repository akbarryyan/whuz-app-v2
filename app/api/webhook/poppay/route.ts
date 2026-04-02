import { NextResponse } from "next/server";
import { handlePoppayCallback, type PoppayCallbackPayload } from "@/lib/poppay-callback";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let rawBody = "";
  let payload: PoppayCallbackPayload | null = null;

  try {
    rawBody = await request.text();
    payload = JSON.parse(rawBody) as PoppayCallbackPayload;
  } catch {
    return NextResponse.json(
      {
        status: "success",
        message: "Invalid JSON ignored",
        data: { id: "ignored-invalid-json", created_at: new Date().toISOString() },
      },
      { status: 200 }
    );
  }

  if (!payload?.refid || !payload?.agg_refid || payload?.status == null) {
    return NextResponse.json(
      {
        status: "success",
        message: "Missing required fields ignored",
        data: { id: "ignored-missing-fields", created_at: new Date().toISOString() },
      },
      { status: 200 }
    );
  }

  try {
    const result = await handlePoppayCallback(payload, JSON.parse(rawBody));
    return NextResponse.json(
      {
        status: "success",
        message: "Operation completed successfully",
        data: {
          id: payload.refid,
          created_at: new Date().toISOString(),
          result,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Webhook/Poppay] Error:", error);
    return NextResponse.json(
      {
        status: "success",
        message: "Operation completed with internal error",
        data: {
          id: payload.refid,
          created_at: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  }
}
