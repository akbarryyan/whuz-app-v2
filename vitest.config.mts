import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Test integrasi memakai satu database nyata. Menjalankan file secara
    // paralel akan membuat mereka saling menghapus data.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": import.meta.dirname },
  },
});
