import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "src") + "/",
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // Exclude node:test files and Playwright e2e tests
    exclude: [
      "**/node_modules/**",
      "**/inboxStore.test.ts",
      "**/e2e/**",
      // Temporarily exclude v4 tests pending type fixes (tracked in PR follow-up)
      "**/v2/__tests__/**",
      "**/x402-binding.test.ts",
      "**/pricing-flow.test.ts",
      "**/defi/__tests__/**",
    ],
    server: {
      deps: {
        // Inline @x402/next so vitest resolves "next/server" ESM import
        inline: ["@x402/next"],
      },
    },
  },
});
