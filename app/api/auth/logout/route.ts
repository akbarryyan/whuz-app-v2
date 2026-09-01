import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getLogger } from "@/lib/logger";

const log = getLogger("auth");

export async function POST() {
  try {
    const session = await getSession();
    session.destroy();

    return NextResponse.json({
      success: true,
      message: "Berhasil logout.",
    });
  } catch (error) {
    log.error({ err: error }, "logout failed");
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan. Coba lagi." },
      { status: 500 }
    );
  }
}
