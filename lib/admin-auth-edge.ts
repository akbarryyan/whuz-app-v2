/**
 * Guard admin — bagian yang aman dijalankan di Edge runtime.
 *
 * File ini sengaja dipisah dari `lib/admin-auth.ts` dengan alasan yang sama
 * seperti `lib/session-constants.ts` dipisah dari `lib/session.ts`: middleware
 * berjalan di Edge dan tidak boleh menarik modul Node. Yang boleh diimpor di
 * sini hanya `iron-session` (kriptonya lewat `uncrypto`, yang punya export
 * condition `edge-light` → WebCrypto) dan `lib/session-constants.ts`.
 *
 * DILARANG diimpor dari sini: `next/headers`, `@/lib/logger` (lihat
 * docs/LOGGING.md), `@/src/infra/db/prisma`, dan `node:*`.
 *
 * `SessionData` diimpor type-only supaya `next/headers` tidak ikut tertarik —
 * `isolatedModules` di tsconfig menjamin import type ter-erase.
 */

import { unsealData } from "iron-session";
import type { SessionData } from "@/lib/session";

export const ADMIN_ROLE = "ADMIN";

/**
 * Kontrak wire tunggal untuk penolakan. Dipakai middleware maupun route
 * handler supaya bentuk body dan status code tidak lagi berbeda-beda seperti
 * enam varian guard yang ada sebelumnya.
 *
 * 401 = tidak ada sesi. 403 = ada sesi, tapi bukan admin.
 */
export const ADMIN_DENY = {
  anonymous: { status: 401, body: { success: false, error: "Unauthorized" } },
  forbidden: { status: 403, body: { success: false, error: "Forbidden" } },
} as const;

export type AdminDenyKind = keyof typeof ADMIN_DENY;

export type SealVerdict =
  | { kind: "ok"; userId: string; email: string; name: string; role: string }
  | { kind: "anonymous" }
  | { kind: "forbidden" };

/**
 * Keputusan murni tanpa I/O. Dipakai ulang oleh jalur Node yang sudah memegang
 * SessionData hasil `getSession()`.
 *
 * Cek `!userId` sengaja ikut: admin dan member berbagi cookie yang sama, dan
 * seal cacat berisi `isLoggedIn:true` tanpa `userId` pernah membuat `senderId`
 * terisi null di app/api/admin/tickets/[id].
 */
export function verdictFromSession(data: SessionData | null | undefined): SealVerdict {
  if (!data?.isLoggedIn || !data.userId) return { kind: "anonymous" };
  if (data.role !== ADMIN_ROLE) return { kind: "forbidden" };

  return {
    kind: "ok",
    userId: data.userId,
    email: data.email ?? "",
    name: data.name ?? "",
    role: data.role,
  };
}

/**
 * Unseal cookie secara manual — `getSession()` butuh `cookies()` dari
 * next/headers yang tidak tersedia di middleware.
 *
 * Mengikuti `lib/http-access-log.ts:104-127`: JANGAN menambahkan opsi `ttl`.
 * `lib/session.ts` menyetel `cookieOptions.maxAge`, bukan `ttl`, sehingga ttl
 * tetap default iron-session — memanggil unsealData tanpa opsi ttl memberi
 * hasil identik dengan getIronSession. Menambahkannya di sini saja akan
 * membuat middleware menolak seal yang masih diterima route handler.
 *
 * Berbeda dari http-access-log yang fail-open (di sana unseal hanya untuk
 * memperkaya log), di sini setiap kegagalan fail-CLOSED.
 */
export async function verdictFromSeal(seal: string | undefined): Promise<SealVerdict> {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) return { kind: "anonymous" };
  if (!seal) return { kind: "anonymous" };

  try {
    const data = await unsealData<SessionData>(seal, { password });
    return verdictFromSession(data);
  } catch {
    // Seal kedaluwarsa / hmac salah / SESSION_SECRET berganti.
    return { kind: "anonymous" };
  }
}
