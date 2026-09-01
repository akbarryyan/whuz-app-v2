/**
 * Session constants — dipisah dari `lib/session.ts` dengan sengaja.
 *
 * `lib/session.ts` meng-import `cookies` dari "next/headers", yang tidak boleh
 * ikut tertarik ke `lib/http-access-log.ts` (file itu dijalankan dari
 * instrumentation, di luar konteks request Next). File ini bebas dependency
 * sehingga aman di-import dari mana saja.
 */

export const SESSION_COOKIE_NAME = "whuzpay_session";
