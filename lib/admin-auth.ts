/**
 * Guard admin untuk route handler (Node runtime).
 *
 * Menggantikan enam varian guard yang tersebar sebelumnya — sebagian 401,
 * sebagian 403, sebagian memakai key `message` alih-alih `error`, sebagian
 * melewatkan cek `userId`. Bentuk penolakan sekarang tunggal, didefinisikan
 * di `lib/admin-auth-edge.ts` supaya middleware memakai kontrak yang sama.
 *
 * Aturan pemakaian — mekanis, tidak butuh penilaian per route:
 *
 *   GET                          → requireAdmin()          (percaya seal, 0 query)
 *   POST / PUT / PATCH / DELETE  → requireAdminVerified()  (+1 query cek DB)
 *
 * Pengecualian: tiga GET berikut tetap requireAdminVerified() karena bobotnya
 * setara mutasi — `site-config` (kredensial), `users` (dump PII), dan
 * `providers/[type]/check-balance` (memanggil API provider sungguhan).
 *
 * Kenapa mutasi perlu cek DB: `role` di cookie adalah snapshot saat login.
 * `lib/session.ts` menyetel `cookieOptions.maxAge` (7 hari) dan bukan `ttl`,
 * jadi seal tetap sah sampai 14 hari — admin yang di-demote atau dinonaktifkan
 * masih akan lolos selama itu kalau kita hanya percaya cookie.
 *
 * Guard harus jadi statement PERTAMA di handler: sebelum `await params`,
 * sebelum `await req.json()`, dan di LUAR blok try — supaya penolakan tidak
 * pernah tertelan catch dan berubah jadi 500.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/src/infra/db/prisma";
import {
  ADMIN_DENY,
  ADMIN_ROLE,
  verdictFromSession,
  type AdminDenyKind,
} from "@/lib/admin-auth-edge";

export interface AdminSession {
  /** Non-optional — inilah gunanya melewati guard. */
  userId: string;
  email: string;
  name: string;
  role: string;
}

export type AdminGuard =
  | { ok: true; session: AdminSession }
  | { ok: false; response: NextResponse };

export function adminDeny(kind: AdminDenyKind): NextResponse {
  const deny = ADMIN_DENY[kind];
  return NextResponse.json(deny.body, { status: deny.status });
}

/** Percaya seal cookie. Tanpa query. Untuk GET / pembacaan. */
export async function requireAdmin(): Promise<AdminGuard> {
  const session = await getSession();
  const verdict = verdictFromSession(session);

  if (verdict.kind !== "ok") {
    return { ok: false, response: adminDeny(verdict.kind) };
  }

  return {
    ok: true,
    session: {
      userId: verdict.userId,
      email: verdict.email,
      name: verdict.name,
      role: verdict.role,
    },
  };
}

/**
 * Seal + verifikasi ulang ke DB (`isActive` dan `role` terkini).
 * Query-nya sama persis dengan yang sudah dilakukan GET /api/admin/auth.
 */
export async function requireAdminVerified(): Promise<AdminGuard> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const user = await prisma.user.findUnique({
    where: { id: guard.session.userId },
    select: { role: true, isActive: true },
  });

  if (!user || !user.isActive || user.role !== ADMIN_ROLE) {
    return { ok: false, response: adminDeny("forbidden") };
  }

  return guard;
}
