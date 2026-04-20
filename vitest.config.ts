import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    setupFiles: ["test/setup.ts"],
    include: ["src-frontend/**/*.test.ts", "test/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src-frontend") },
  },
});
