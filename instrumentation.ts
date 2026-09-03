/**
 * Next.js instrumentation hook.
 *
 * `register()` dipanggil sekali saat server siap — di sini kita memasang HTTP
 * access log dan mencatat baris `server-start`.
 *
 * Semua import dilakukan dinamis di dalam guard NEXT_RUNTIME: DefinePlugin
 * meng-inline `process.env.NEXT_RUNTIME` jadi literal, sehingga blok ini
 * ter-eliminasi di bundle edge dan `rotating-file-stream` tidak pernah ikut
 * ke sana.
 *
 * JANGAN memakai API Node-only di file ini (`process.version`, `process.pid`,
 * `fs`, dsb) meskipun ada di balik guard. Selama `middleware.ts` masih ada,
 * Next ikut meng-compile file ini untuk Edge runtime, dan Turbopack menandai
 * API semacam itu secara statis — build tetap sukses tapi memunculkan warning
 * di setiap build. Nilai yang butuh API Node ambil di dalam `lib/logger.ts`
 * atau `lib/http-access-log.ts`, yang hanya dimuat di jalur Node.
 */

type RequestErrorContext = Readonly<{
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "proxy";
  renderSource?: "react-server-components" | "react-server-components-payload" | "server-rendering";
  revalidateReason: "on-demand" | "stale" | undefined;
}>;

type ErrorRequest = Readonly<{
  path: string;
  method: string;
  headers: NodeJS.Dict<string | string[]>;
}>;

/**
 * Periksa variabel lingkungan yang kalau salah membuat aplikasi rusak secara
 * senyap, bukan gagal dengan jelas.
 *
 * SESSION_SECRET adalah contoh terburuknya: kalau kosong atau terlalu pendek,
 * iron-session melempar di setiap permintaan yang menyentuh sesi, dan guard di
 * middleware.ts gagal-tertutup — artinya TIDAK ADA yang bisa masuk halaman
 * admin, sementara halaman publik terlihat baik-baik saja. Lebih baik server
 * menolak menyala dengan pesan yang menyebut sebabnya.
 */
function validateEnvironment(): void {
  const masalah: string[] = [];

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    masalah.push("SESSION_SECRET belum diisi.");
  } else if (secret.length < 32) {
    masalah.push(`SESSION_SECRET terlalu pendek (${secret.length} karakter, minimal 32).`);
  }

  if (!process.env.DATABASE_URL) {
    masalah.push("DATABASE_URL belum diisi.");
  }

  if (masalah.length > 0) {
    throw new Error(
      "Konfigurasi lingkungan tidak lengkap:\n" +
        masalah.map((m) => `  - ${m}`).join("\n") +
        "\nPeriksa berkas .env yang dimuat proses ini.",
    );
  }
}

/**
 * Peringatan yang tidak menghentikan server, tetapi hampir selalu berarti salah
 * konfigurasi.
 */
function environmentWarnings(): string[] {
  const peringatan: string[] = [];

  if (process.env.NODE_ENV === "production") {
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    if (!appUrl) {
      peringatan.push(
        "APP_URL kosong di produksi: cookie sesi tidak akan disetel Secure " +
          "(lihat shouldUseSecureCookies di lib/session.ts).",
      );
    } else if (!appUrl.startsWith("https://")) {
      peringatan.push(
        `APP_URL bukan https (${appUrl}): cookie sesi tidak disetel Secure. ` +
          "Kalau browser sebenarnya mengakses lewat https, login tidak akan menempel.",
      );
    }
  }

  return peringatan;
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Sebelum apa pun yang lain: hentikan proses kalau konfigurasinya membuat
  // aplikasi rusak secara senyap.
  validateEnvironment();

  const { installHttpAccessLog } = await import("@/lib/http-access-log");
  installHttpAccessLog();

  const { getLogger } = await import("@/lib/logger");
  getLogger("app").info(
    {
      // Diaudit di sini karena format `time` bergantung timezone proses:
      // kalau ini bukan Asia/Jakarta, offset di log jadi bukan +07:00.
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      logDir: process.env.LOG_DIR ?? "./logs",
      logFile: process.env.LOG_FILE ?? "app.json",
    },
    "server-start",
  );

  for (const peringatan of environmentWarnings()) {
    getLogger("app").warn({ peringatan }, "konfigurasi lingkungan patut diperiksa");
  }
}

export const onRequestError = async (
  error: unknown,
  request: ErrorRequest,
  context: RequestErrorContext,
): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getLogger } = await import("@/lib/logger");
  getLogger("http").error(
    {
      route: context.routePath,
      method: request.method,
      path: request.path,
      routerKind: context.routerKind,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
      err: error,
    },
    "request-error",
  );
};
