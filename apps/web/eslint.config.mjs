import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // V4 routes pending type cleanup (tracked)
    "src/app/api/v2/**",
    "src/lib/x402.ts",
    "src/lib/x402-request-binding.ts",
    "src/lib/nonce-registry.ts",
    "src/lib/indexer.ts",
    "src/lib/rate-limit.ts",
    "src/lib/metrics.ts",
  ]),
]);

export default eslintConfig;
