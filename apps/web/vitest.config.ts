import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "src/"),
      "@/app/": path.resolve(__dirname, "src/app/"),
    },
  },
  test: {
    environment: "node",
    // Exclude node:test files (inboxStore uses built-in test runner, not Vitest)
    exclude: ["**/node_modules/**", "**/inboxStore.test.ts"],
    server: {
      deps: {
        // Inline @x402/next so vitest resolves "next/server" ESM import
        inline: ["@x402/next"],
      },
    },
  },
});
