/**
 * HTTP access log — memasang diri di level Node http server.
 *
 * Dipanggil sekali dari `instrumentation.ts`. Mem-patch
 * `http.Server.prototype.emit` (bukan `http.createServer`: Next sudah membuat
 * server-nya secara sinkron di `start-server.js` sebelum `register()` jalan,
 * jadi createServer sudah lewat — instance yang ada tetap mewarisi prototype).
 *
 * Menghasilkan satu baris per request:
 *   {… "subsystem":"http","requestId":…,"route":…,"method":…,"userId":…,
 *      "path":…,"status":200,"durationMs":15,"msg":"access"}
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { unsealData } from "iron-session";
import { getLogger } from "@/lib/logger";
import { requestContext, type RequestContext } from "@/lib/request-context";
import { SESSION_COOKIE_NAME } from "@/lib/session-constants";
import type { SessionData } from "@/lib/session";

/**
 * Next menyimpan metadata request (termasuk matched route) di symbol ini, pada
 * objek `req` mentah yang sama. API internal — selalu akses defensif.
 */
const NEXT_REQUEST_META = Symbol.for("NextInternalRequestMeta");

const SKIP_PREFIXES = [
  "/_next/static",
  "/_next/image",
  "/_next/webpack-hmr",
  "/_next/data",
  "/__nextjs",
  "/_vercel",
  "/uploads/",
];

const SKIP_EXACT = new Set(["/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.json"]);

const SKIP_EXTENSION =
  /\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|eot|txt|xml)$/i;

/** requestId dari luar boleh dipakai, tapi jangan sampai jadi jalur injeksi. */
const REQUEST_ID_PATTERN = /^[\w.:-]{1,128}$/;

const envFlag = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw !== "false" && raw !== "0";
};

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function shouldLog(pathname: string, req: http.IncomingMessage): boolean {
  if (SKIP_EXACT.has(pathname)) return false;
  for (const prefix of SKIP_PREFIXES) if (pathname.startsWith(prefix)) return false;
  if (SKIP_EXTENSION.test(pathname)) return false;

  if (isApiPath(pathname)) return true;
  if (!envFlag("LOG_HTTP_PAGES", true)) return false;

  // RSC prefetch dipicu <Link> tiap hover/masuk viewport — sumber noise terbesar.
  if (!envFlag("LOG_HTTP_PREFETCH", false) && req.headers["next-router-prefetch"] === "1") {
    return false;
  }
  return true;
}

/** Route pattern (mis. `/api/orders/[code]`), best-effort. Fallback ke pathname. */
function matchedRoute(req: http.IncomingMessage): string | undefined {
  try {
    const meta = (req as unknown as Record<symbol, unknown>)[NEXT_REQUEST_META] as
      | { match?: { definition?: { pathname?: string } }; invokePath?: string }
      | undefined;
    const pattern = meta?.match?.definition?.pathname;
    if (typeof pattern === "string" && pattern.length > 0) return pattern;
    return typeof meta?.invokePath === "string" && meta.invokePath.length > 0
      ? meta.invokePath
      : undefined;
  } catch {
    return undefined;
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/**
 * Unseal cookie iron-session secara manual — `getSession()` tidak bisa dipakai
 * di sini karena butuh `cookies()` dari next/headers, dan kita di luar konteks
 * request Next.
 *
 * `lib/session.ts` menyetel `cookieOptions.maxAge`, bukan `ttl`, sehingga ttl
 * tetap default iron-session (14 hari) — memanggil unsealData tanpa opsi ttl
 * memberi hasil identik dengan getIronSession.
 */
async function resolveUserId(req: http.IncomingMessage): Promise<string | undefined> {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) return undefined;

  const seal = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
  if (!seal) return undefined;

  try {
    const data = await unsealData<SessionData>(seal, { password });
    return data?.userId;
  } catch {
    // Seal kedaluwarsa / hmac salah / SESSION_SECRET berganti — bukan error kita.
    return undefined;
  }
}

const PATCHED_KEY = Symbol.for("whuzpay.http.accessLog.patched");
type GlobalWithPatch = typeof globalThis & { [PATCHED_KEY]?: boolean };

export function installHttpAccessLog(): void {
  const g = globalThis as GlobalWithPatch;
  if (g[PATCHED_KEY]) return; // register() bisa dipanggil ulang saat hot reload
  g[PATCHED_KEY] = true;

  const log = getLogger("http");
  const proto = http.Server.prototype;

  // @types/node memberi `emit` overload per-event yang ketat; di sini kita
  // memang meneruskan event apa adanya, jadi pakai bentuk generiknya.
  type RawEmit = (this: http.Server, event: string | symbol, ...args: unknown[]) => boolean;
  const originalEmit = proto.emit as RawEmit;

  const patchedEmit: RawEmit = function patchedEmit(
    this: http.Server,
    event: string | symbol,
    ...args: unknown[]
  ): boolean {
    if (event !== "request") return originalEmit.call(this, event, ...args);

    let ctx: RequestContext | undefined;

    try {
      const req = args[0] as http.IncomingMessage;
      const res = args[1] as http.ServerResponse;

      const rawUrl = req.url ?? "/";
      const queryAt = rawUrl.indexOf("?");
      const pathname = queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt);

      const inbound = req.headers["x-request-id"];
      const requestId =
        typeof inbound === "string" && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID();

      ctx = { requestId, method: req.method, path: pathname };

      try {
        res.setHeader("x-request-id", requestId);
      } catch {
        /* header sudah terkirim */
      }
      // Jaring pengaman: kalau AsyncLocalStorage tidak tembus antar webpack
      // layer, requestId masih bisa dibaca route handler lewat headers().
      req.headers["x-request-id"] = requestId;

      if (shouldLog(pathname, req)) {
        const startNs = process.hrtime.bigint();

        // Jalan paralel, tidak memblok emit; hasilnya di-await saat finalize.
        const userIdPromise = resolveUserId(req).catch(() => undefined);
        void userIdPromise.then((userId) => {
          if (ctx) ctx.userId = userId;
        });

        let finalized = false;
        const finalize = (viaClose: boolean) => {
          if (finalized) return;
          finalized = true;

          const durationMs = Math.round(Number(process.hrtime.bigint() - startNs) / 1e6);
          const aborted = viaClose && !res.writableFinished;
          const status = aborted ? 499 : res.statusCode;
          const route = matchedRoute(req) ?? pathname;

          void userIdPromise.then((userId) => {
            log.info(
              {
                route,
                method: req.method,
                userId,
                path: pathname,
                status,
                durationMs,
                ...(aborted ? { aborted: true } : null),
              },
              "access",
            );
          });
        };

        res.on("finish", () => finalize(false));
        res.on("close", () => finalize(true));
      }
    } catch {
      // Logging tidak boleh pernah mematahkan request handling.
      ctx = undefined;
    }

    return ctx
      ? requestContext.run(ctx, () => originalEmit.call(this, event, ...args))
      : originalEmit.call(this, event, ...args);
  };

  proto.emit = patchedEmit as typeof proto.emit;
}
