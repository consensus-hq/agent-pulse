import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/inboxStore.test.ts", "**/e2e/**", "**/_disabled/**"],
    server: {
      deps: {
        inline: ["@x402/next"],
      },
    },
  },
});
