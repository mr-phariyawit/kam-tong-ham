import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["server/src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["server/src/rooms/**", "server/src/utils/**"],
      reporter: ["text", "json-summary"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "server/src"),
    },
  },
});
