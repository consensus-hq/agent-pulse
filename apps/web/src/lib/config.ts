/**
 * Shared configuration utility for Agent Pulse web app.
 * All values read from environment variables with safe mainnet fallbacks.
 *
 * Usage:
 *   import { getAppUrl, getContractAddress, getChainId } from "@/lib/config";
 */

// ── Defaults (Base Mainnet) ──────────────────────────────

const FALLBACK_APP_URL = "https://agent-pulse-nine.vercel.app";

const CONTRACT_DEFAULTS: Record<string, string> = {
  pulseToken: "0x21111B39A502335aC7e45c4574Dd083A69258b07",
  pulseRegistry: "0xe61C615743A02983A46aFF66Db035297e8a43846",
  burnWithFee: "0xd38cC332ca9755DE536841f2A248f4585Fb08C1E",
  peerAttestation: "0x930dC6130b20775E01414a5923e7C66b62FF8d6C",
  identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
};

const CONTRACT_ENV_KEYS: Record<string, string> = {
  pulseToken: "NEXT_PUBLIC_PULSE_TOKEN_ADDRESS",
  pulseRegistry: "NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS",
  burnWithFee: "NEXT_PUBLIC_BURN_WITH_FEE_ADDRESS",
  peerAttestation: "NEXT_PUBLIC_PEER_ATTESTATION_ADDRESS",
  identityRegistry: "NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS",
};

const DEFAULT_CHAIN_ID = "8453";
const DEFAULT_RPC_URL = "https://mainnet.base.org";

// ── App URL ──────────────────────────────────────────────

/**
 * Get the application base URL.
 * - Client-side: uses `window.location.origin`
 * - Server-side: reads `NEXT_PUBLIC_APP_URL` with hardcoded fallback
 */
export function getAppUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL || FALLBACK_APP_URL;
}

/**
 * Server-only app URL (for metadata, API routes). Never touches `window`.
 */
export function getServerAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || FALLBACK_APP_URL;
}

// ── Contract Addresses ───────────────────────────────────

/**
 * Get a contract address by logical name.
 * Reads the matching `NEXT_PUBLIC_*` env var, falls back to mainnet default.
 *
 * Supported names: pulseToken, pulseRegistry, burnWithFee,
 *                  peerAttestation, identityRegistry
 */
export function getContractAddress(name: string): string {
  const envKey = CONTRACT_ENV_KEYS[name];
  if (envKey) {
    // process.env is inlined at build time for NEXT_PUBLIC_ vars,
    // so we need explicit lookups rather than dynamic indexing.
    const val = getEnvVar(envKey);
    if (val) return val;
  }
  return CONTRACT_DEFAULTS[name] ?? "";
}

// ── Chain Config ─────────────────────────────────────────

/**
 * Get the chain ID (defaults to Base Mainnet 8453).
 */
export function getChainId(): string {
  return (
    process.env.CHAIN_ID ||
    process.env.NEXT_PUBLIC_CHAIN_ID ||
    DEFAULT_CHAIN_ID
  );
}

/**
 * Get the RPC URL (defaults to https://mainnet.base.org).
 */
export function getRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_RPC_URL ||
    process.env.BASE_RPC_URL ||
    DEFAULT_RPC_URL
  );
}

// ── Internal helpers ─────────────────────────────────────

/**
 * Lookup a NEXT_PUBLIC_ env var by exact key.
 * Next.js inlines these at build time so we must enumerate them explicitly.
 */
function getEnvVar(key: string): string | undefined {
  switch (key) {
    case "NEXT_PUBLIC_PULSE_TOKEN_ADDRESS":
      return process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS;
    case "NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS":
      return process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS;
    case "NEXT_PUBLIC_BURN_WITH_FEE_ADDRESS":
      return process.env.NEXT_PUBLIC_BURN_WITH_FEE_ADDRESS;
    case "NEXT_PUBLIC_PEER_ATTESTATION_ADDRESS":
      return process.env.NEXT_PUBLIC_PEER_ATTESTATION_ADDRESS;
    case "NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS":
      return process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS;
    default:
      return undefined;
  }
}
