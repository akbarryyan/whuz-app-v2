/**
 * Per-request context (requestId, userId) via AsyncLocalStorage.
 *
 * Diisi oleh `lib/http-access-log.ts` saat request masuk, dibaca oleh
 * `mixin()` di `lib/logger.ts` supaya setiap baris log otomatis membawa
 * `requestId` yang sama dengan baris `access`-nya.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  /** Diisi asinkron setelah cookie session di-unseal; bisa masih undefined di awal. */
  userId?: string;
  method?: string;
  path?: string;
}

const ALS_KEY = Symbol.for("whuzpay.requestContext.als");

type GlobalWithAls = typeof globalThis & {
  [ALS_KEY]?: AsyncLocalStorage<RequestContext>;
};

const globalForAls = globalThis as GlobalWithAls;

/**
 * Singleton via globalThis — WAJIB, bukan sekadar optimasi hot-reload.
 *
 * `instrumentation.ts` di-compile Next di webpack layer `instrument`, sedangkan
 * route handler ada di layer RSC. Layer berbeda = instance modul berbeda, jadi
 * tanpa ini akan ada dua AsyncLocalStorage dan requestId tidak akan nyambung
 * antara access log dan log aplikasi.
 */
export const requestContext: AsyncLocalStorage<RequestContext> =
  globalForAls[ALS_KEY] ??
  (globalForAls[ALS_KEY] = new AsyncLocalStorage<RequestContext>());

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/**
 * Jalankan `fn` dengan context tertentu. Dipakai untuk pekerjaan yang berjalan
 * DI LUAR request HTTP — mis. sapuan rekonsiliasi berkala — supaya lognya tetap
 * punya correlation id, sesuatu yang biasanya disuntikkan oleh access log.
 */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContext.run(ctx, fn);
}
