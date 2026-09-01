/**
 * Structured JSON logging (pino) dengan rotasi file by-size.
 *
 * Output satu baris NDJSON per event ke `logs/app.json`:
 *
 *   {"level":"info","time":"2026-08-31T09:29:35.738+07:00","app":"whuzpay",
 *    "env":"production","pid":2084836,"subsystem":"http","requestId":"…",
 *    "route":"/api/auth/me","method":"GET","userId":"…","path":"/api/auth/me",
 *    "status":200,"durationMs":15,"msg":"access"}
 *
 * Rotasi: saat file menyentuh LOG_MAX_SIZE (default 10M) → diarsipkan jadi
 * `app.1.json.gz`, `app.2.json.gz`, … dan hanya LOG_MAX_FILES terakhir disimpan.
 *
 * Pemakaian — lihat docs/LOGGING.md:
 *
 *   import { getLogger } from "@/lib/logger";
 *   const log = getLogger("webhook");
 *   log.info({ orderId }, "order paid");
 *   log.error({ err, orderId }, "provider execute failed");
 */

import fs from "node:fs";
import path from "node:path";
import pino, { type Logger, type LoggerOptions } from "pino";
import { requestContext } from "@/lib/request-context";

/**
 * Daftar tertutup — TypeScript menolak nilai di luar ini. Sengaja, supaya nama
 * subsystem tidak melenceng saat dipakai di ratusan call site.
 */
export type Subsystem =
  | "app"
  | "http"
  | "auth"
  | "admin"
  | "webhook"
  | "payment"
  | "provider"
  | "order"
  | "wallet"
  | "catalog"
  | "seller"
  | "worker"
  | "db"
  | "notify";

const isProd = process.env.NODE_ENV === "production";

// ── Timestamp: ISO8601 dengan offset zona waktu lokal ────────────────────────

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const pad3 = (n: number) => (n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`);

/** `2026-08-31T09:29:35.738+07:00` — memakai timezone proses, jadi set TZ di VPS. */
export function isoWithOffset(d: Date = new Date()): string {
  const offsetMinutes = -d.getTimezoneOffset(); // Asia/Jakarta → 420
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` +
    `.${pad3(d.getMilliseconds())}` +
    `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  );
}

// pino menempelkan hasil ini apa adanya ke string JSON, jadi harus ikut koma
// dan nama fieldnya.
const timestamp = () => `,"time":"${isoWithOffset()}"`;

// ── Redaction ────────────────────────────────────────────────────────────────

const SECRET_KEYS = [
  "password",
  "passwordHash",
  "newPassword",
  "oldPassword",
  "confirmPassword",
  "pin",
  "otp",
  "otpCode",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "secret",
  "clientSecret",
  "signature",
  "sign",
  "authorization",
  "cookie",
];

/**
 * Hanya satu wildcard per path — itu yang dijamin didukung fast-redact, dan
 * path yang invalid membuat pino throw saat startup.
 */
const REDACT_PATHS = [
  ...SECRET_KEYS,
  ...SECRET_KEYS.map((k) => `*.${k}`),
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
];

const CENSOR = "[REDACTED]";

const DEEP_REDACT_KEYS = new Set(SECRET_KEYS.map((k) => k.toLowerCase()));

/**
 * Sensor rekursif untuk payload yang kedalamannya tidak diketahui (response
 * provider, body webhook). `redact` bawaan pino hanya jalan sampai kedalaman
 * yang di-declare, jadi pakai ini sebelum melempar payload ke logger.
 */
export function redactDeep<T>(value: T, maxDepth = 8): T {
  const seen = new WeakSet<object>();

  const walk = (input: unknown, depth: number): unknown => {
    if (depth > maxDepth || input === null || typeof input !== "object") return input;
    if (seen.has(input as object)) return "[Circular]";
    seen.add(input as object);

    if (Array.isArray(input)) return input.map((item) => walk(item, depth + 1));

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      out[key] = DEEP_REDACT_KEYS.has(key.toLowerCase()) ? CENSOR : walk(val, depth + 1);
    }
    return out;
  };

  return walk(value, 0) as T;
}

// ── Destination ──────────────────────────────────────────────────────────────

const LOG_DIR = path.resolve(process.env.LOG_DIR ?? "./logs");

/**
 * PM2 cluster mode menjalankan beberapa instance dari satu app, dan dua proses
 * TIDAK boleh menulis file log yang sama: masing-masing melacak ukuran file di
 * memorinya sendiri lalu me-rename file aktif di bawah kaki proses lain, dan
 * baris log hilang tanpa jejak.
 *
 * PM2 menyetel NODE_APP_INSTANCE per instance. Instance 0 (dan fork mode)
 * memakai nama dasar; instance 1..N mendapat sufiks sendiri, mis. `app-1.json`.
 */
function withInstanceSuffix(filename: string): string {
  const instance = process.env.NODE_APP_INSTANCE;
  if (!instance || instance === "0") return filename;
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return `${filename}-${instance}`;
  return `${filename.slice(0, dot)}-${instance}${filename.slice(dot)}`;
}

const LOG_FILE = withInstanceSuffix(process.env.LOG_FILE ?? "app.json");
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE ?? "10M";
const LOG_MAX_FILES = Number(process.env.LOG_MAX_FILES ?? 10);

const envFlag = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw !== "false" && raw !== "0";
};

/**
 * `app.json` → `app.1.json.gz` (terbaru) → `app.2.json.gz` → … → `app.N.json.gz`.
 *
 * Dipakai dalam mode `rotate` (classical, ala logrotate): tiap rotasi menggeser
 * seluruh arsip satu nomor, jadi nomor kecil selalu berarti lebih baru. Mode
 * default rfs sebaliknya memakai index "cari slot kosong pertama", sehingga
 * nomornya di-reuse setelah retensi menghapus arsip lama dan tidak lagi
 * menandakan urutan waktu.
 *
 * rfs TIDAK menambahkan `.gz` sendiri — yang melakukannya adalah generator
 * bawaannya. Generator custom harus mengurusnya.
 */
function makeFilenameGenerator(base: string, compress: boolean) {
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  const suffix = compress ? ".gz" : "";

  // Mode classical memanggil generator(count) — argumen pertama adalah index,
  // bukan waktu. `null`/0 berarti file yang sedang aktif ditulis.
  return (timeOrIndex: number | Date | null, index?: number): string => {
    const n = typeof timeOrIndex === "number" ? timeOrIndex : index;
    if (!timeOrIndex || !n) return base;
    return `${stem}.${n}${ext}${suffix}`;
  };
}

function createFileStream(): NodeJS.WritableStream | null {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });

    // require (bukan import statik) supaya kegagalan resolve bisa ditangkap di
    // sini dan jatuh ke stdout, bukan meledak saat modul dimuat.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rfs = require("rotating-file-stream") as typeof import("rotating-file-stream");

    const stream = rfs.createStream(makeFilenameGenerator(LOG_FILE, true), {
      path: LOG_DIR,
      size: LOG_MAX_SIZE,
      // `rotate` = mode classical: geser app.1 → app.2 → … dan buang yang
      // melewati batas. Retensi ditangani mode ini, jadi maxFiles/history
      // memang tidak dipakai (rfs sendiri mengabaikannya saat rotate di-set).
      rotate: LOG_MAX_FILES,
      compress: "gzip",
      encoding: "utf8",
      mode: 0o640,
    });

    // WAJIB: rfs menutup stream setelah event 'error', dan 'error' tanpa
    // listener mematikan proses.
    stream.on("error", (err) => {
      try {
        process.stderr.write(`[logger] file stream error: ${String(err)}\n`);
      } catch {
        /* stderr pun gagal — tidak ada lagi yang bisa dilakukan */
      }
    });
    stream.on("warning", () => {});

    return stream;
  } catch (err) {
    // FS read-only, EACCES, modul tidak ketemu — logging boleh mati, app jangan.
    try {
      process.stderr.write(`[logger] file logging disabled: ${String(err)}\n`);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function createPrettyStream(): NodeJS.WritableStream {
  try {
    // require CJS mengembalikan fungsinya langsung, tapi juga menyediakan
    // `.default` untuk interop ESM — terima keduanya.
    type PrettyFactory = (opts: Record<string, unknown>) => NodeJS.WritableStream;
    // require: pino-pretty hanya devDependency, jadi absennya di produksi harus
    // bisa ditangkap try/catch, bukan menggagalkan pemuatan modul.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("pino-pretty") as PrettyFactory & { default?: PrettyFactory };
    const pretty = mod.default ?? mod;
    return pretty({
      colorize: true,
      // `time` kita sudah string ISO — biarkan dicetak apa adanya.
      translateTime: false,
      ignore: "pid,app,env",
      messageFormat: "[{subsystem}] {msg}",
    });
  } catch {
    // pino-pretty devDependency saja; di produksi jatuh ke JSON mentah.
    return process.stdout;
  }
}

function buildDestination(): {
  stream: pino.DestinationStream;
  file: NodeJS.WritableStream | null;
} {
  const file = envFlag("LOG_TO_FILE", true) ? createFileStream() : null;
  const wantStdout = envFlag("LOG_TO_STDOUT", !isProd);

  const streams: pino.StreamEntry[] = [];
  if (file) streams.push({ level: "trace", stream: file as pino.DestinationStream });

  // Kalau file gagal dibuka, stdout jadi wajib supaya log tidak hilang total.
  if (wantStdout || !file) {
    const out =
      !isProd && envFlag("LOG_PRETTY", true) ? createPrettyStream() : process.stdout;
    streams.push({ level: "trace", stream: out as pino.DestinationStream });
  }

  return {
    stream: streams.length === 1 ? streams[0].stream : pino.multistream(streams),
    file,
  };
}

// ── Shutdown ─────────────────────────────────────────────────────────────────

/**
 * rotating-file-stream membungkus fs.createWriteStream — write-nya asinkron dan
 * tidak punya flushSync, jadi `pino.final()` tidak bisa dipakai. Yang bisa
 * dilakukan: beri stream kesempatan drain sebelum proses benar-benar mati.
 *
 * Sengaja TIDAK memasang handler SIGINT/SIGTERM: Next `start-server.js` sudah
 * punya dan memanggil process.exit(0); menambah handler sendiri justru memotong
 * graceful shutdown-nya.
 */
function installExitHandlers(root: Logger, file: NodeJS.WritableStream | null): void {
  const HANDLERS_KEY = Symbol.for("whuzpay.logger.exitHandlers");
  const g = globalThis as typeof globalThis & { [HANDLERS_KEY]?: boolean };
  if (g[HANDLERS_KEY]) return;
  g[HANDLERS_KEY] = true;

  process.on("uncaughtException", (err) => {
    try {
      root.fatal({ err }, "uncaughtException");
    } catch {
      /* ignore */
    }
    let exited = false;
    const finish = () => {
      if (exited) return;
      exited = true;
      process.exit(1);
    };
    const timer = setTimeout(finish, 300);
    timer.unref?.();
    if (file) file.end(finish);
    else finish();
  });

  process.on("unhandledRejection", (reason) => {
    // Jangan exit — biarkan perilaku default Next.
    try {
      root.error({ err: reason }, "unhandledRejection");
    } catch {
      /* ignore */
    }
  });

  process.on("beforeExit", () => {
    try {
      root.flush?.();
    } catch {
      /* ignore */
    }
  });
}

/** Untuk skrip one-shot (worker:once) — beri stream waktu menulis sebelum keluar. */
export function flushLogs(timeoutMs = 1000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    timer.unref?.();
    try {
      store.root.flush?.();
    } catch {
      /* ignore */
    }
    if (!store.file) {
      clearTimeout(timer);
      resolve();
      return;
    }
    store.file.write("", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// ── Singleton ────────────────────────────────────────────────────────────────

interface LoggerStore {
  root: Logger;
  file: NodeJS.WritableStream | null;
  children: Map<Subsystem, Logger>;
}

const STORE_KEY = Symbol.for("whuzpay.logger.root");
type GlobalWithLogger = typeof globalThis & { [STORE_KEY]?: LoggerStore };
const globalForLogger = globalThis as GlobalWithLogger;

function init(): LoggerStore {
  const { stream, file } = buildDestination();

  const options: LoggerOptions = {
    level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
    // `base` eksplisit — default pino menyisipkan `hostname` dan urutannya beda.
    base: {
      app: process.env.LOG_APP_NAME ?? "whuzpay",
      env: process.env.NODE_ENV ?? "development",
      pid: process.pid,
    },
    formatters: {
      // level jadi string ("info"), bukan angka (30).
      level: (label) => ({ level: label }),
    },
    timestamp,
    messageKey: "msg",
    errorKey: "err",
    redact: { paths: REDACT_PATHS, censor: CENSOR },
    serializers: { err: pino.stdSerializers.err },
    mixin() {
      const ctx = requestContext.getStore();
      return ctx?.requestId ? { requestId: ctx.requestId } : {};
    },
  };

  const root = pino(options, stream);
  installExitHandlers(root, file);

  return { root, file, children: new Map() };
}

/**
 * Singleton via globalThis — WAJIB. instrumentation.ts dan route handler
 * di-compile Next di webpack layer berbeda, jadi tanpa ini akan ada dua
 * rotating-file-stream membuka logs/app.json sekaligus (rotasi ganda,
 * akuntansi ukuran file kacau).
 */
const store: LoggerStore = globalForLogger[STORE_KEY] ?? (globalForLogger[STORE_KEY] = init());

export const logger = store.root;

export function getLogger(subsystem: Subsystem): Logger {
  let child = store.children.get(subsystem);
  if (!child) {
    child = store.root.child({ subsystem });
    store.children.set(subsystem, child);
  }
  return child;
}
