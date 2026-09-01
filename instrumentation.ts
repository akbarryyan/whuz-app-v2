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

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { installHttpAccessLog } = await import("@/lib/http-access-log");
  installHttpAccessLog();

  const { getLogger } = await import("@/lib/logger");
  getLogger("app").info(
    {
      nodeVersion: process.version,
      // Diaudit di sini karena format `time` bergantung timezone proses:
      // kalau ini bukan Asia/Jakarta, offset di log jadi bukan +07:00.
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      logDir: process.env.LOG_DIR ?? "./logs",
      logFile: process.env.LOG_FILE ?? "app.json",
    },
    "server-start",
  );
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
