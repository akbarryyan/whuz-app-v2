import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // Structured logging: kode server memakai getLogger(), bukan console.
  // Lihat docs/LOGGING.md.
  {
    files: [
      "app/**/*.{ts,tsx}",
      "lib/**/*.ts",
      "src/**/*.ts",
      "components/**/*.{ts,tsx}",
      "hooks/**/*.ts",
      "middleware.ts",
    ],
    rules: { "no-console": "error" },
  },

  // Pengecualian yang disengaja — jangan ditambah tanpa alasan sekelas ini.
  {
    files: [
      // CLI seeder: jalan di luar Next, outputnya untuk operator di terminal,
      // dan seed-admin mencetak password — tidak boleh masuk file log.
      "prisma/**/*.ts",
      // "use client": pino butuh node:fs, mengimpornya merusak build browser.
      "app/admin/products/page.tsx",
      "app/admin/providers/page.tsx",
      "app/admin/transactions/page.tsx",
      // Fallback ke stderr saat logger sendiri yang gagal.
      "lib/logger.ts",
      "instrumentation.ts",
    ],
    rules: { "no-console": "off" },
  },
]);

export default eslintConfig;
