import { NextRequest, NextResponse } from "next/server";
import { ADMIN_DENY, verdictFromSeal } from "@/lib/admin-auth-edge";
import { SESSION_COOKIE_NAME } from "@/lib/session-constants";

/**
 * Middleware ini berjalan di Edge runtime dan matcher-nya mencakup hampir
 * seluruh path. Konsekuensinya: apa pun yang melempar di sini menjadi 500
 * untuk SELURUH situs, termasuk homepage dan checkout. Karena itu setiap
 * jalur di bawah dibungkus penanganan error dan tidak boleh ada yang lolos.
 *
 * Batasan import (lihat docs/LOGGING.md dan komentar di instrumentation.ts):
 * hanya `next/server`, `@/lib/admin-auth-edge`, dan `@/lib/session-constants`.
 * DILARANG: `@/lib/logger`, Prisma, `next/headers`, `node:*`.
 *
 * Guard admin di sini adalah LAPISAN KEDUA, bukan sumber kebenaran — ia hanya
 * bisa membaca cookie, tidak bisa menyentuh DB. Verifikasi sesungguhnya tetap
 * di route handler lewat `lib/admin-auth.ts`.
 */

// Paths that are NEVER blocked by maintenance mode
const EXCLUDED = [
  "/admin",
  "/api",
  "/login",
  "/maintenance",
  "/_next",
  "/_vercel",
  "/favicon",
  "/robots",
  "/sitemap",
];

/**
 * Dua path ini dibiarkan lolos guard, dicocokkan dengan kesetaraan PERSIS
 * (bukan prefix, supaya "/api/admin/authX" tidak ikut lolos).
 *
 * `/api/admin/auth` adalah endpoint login admin (POST) sekaligus endpoint
 * verifikasi yang dipanggil hooks/useAdminAuth.ts (GET). Memblokirnya berarti
 * tidak ada seorang pun yang bisa login lagi, dan pemulihannya butuh deploy.
 */
const ADMIN_AUTH_API = "/api/admin/auth";
const ADMIN_LOGIN_PAGE = "/admin/login";

function denyApi(kind: "anonymous" | "forbidden") {
  // JSON, bukan redirect HTML — pemanggil fetch di sisi admin memanggil
  // r.json() tanpa mengecek res.ok lebih dulu.
  const deny = ADMIN_DENY[kind];
  return NextResponse.json(deny.body, { status: deny.status });
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = ADMIN_LOGIN_PAGE;
  // Buang query asli lebih dulu; app/admin/login/page.tsx membaca `reason`
  // dari URL ini dan langsung membersihkannya.
  url.search = "";
  url.searchParams.set("reason", "unauthorized");
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminApi = pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  const isAdminPage =
    !isAdminApi && (pathname === "/admin" || pathname.startsWith("/admin/"));

  if (isAdminApi || isAdminPage) {
    if (pathname === ADMIN_AUTH_API || pathname === ADMIN_LOGIN_PAGE) {
      return NextResponse.next();
    }

    let kind: "ok" | "anonymous" | "forbidden";
    try {
      const seal = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      kind = (await verdictFromSeal(seal)).kind;
    } catch {
      // verdictFromSeal sudah fail-closed sendiri; ini jaring terakhir kalau
      // pembacaan cookie yang bermasalah.
      kind = "anonymous";
    }

    if (kind !== "ok") {
      return isAdminApi ? denyApi(kind) : redirectToLogin(request);
    }

    // Cookie bilang admin → teruskan. Route handler tetap meng-guard ulang.
    // Return eksplisit: jangan jatuh ke logika maintenance di bawah.
    return NextResponse.next();
  }

  // ── Di bawah ini identik dengan middleware sebelumnya ────────────────────

  // Check if path is excluded from maintenance mode
  const isExcluded = EXCLUDED.some((prefix) => pathname.startsWith(prefix));
  if (isExcluded) return NextResponse.next();

  // Read cheap cookie set by the toggle API
  const maint = request.cookies.get("_maint")?.value;
  if (maint === "1") {
    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image  (image optimisation)
     * - favicon.ico / public assets with extension
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)",
  ],
};
