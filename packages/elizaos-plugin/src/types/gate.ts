/**
 * Gate Types
 *
 * Type definitions for the Pulse Gate functionality.
 * @module types/gate
 */

import type { AgentStatus } from "../types";

// ============================================================================
// Gate Configuration Types
// ============================================================================

/**
 * Gate mode behavior
 */
export type GateMode = "strict" | "permissive" | "audit";

/**
 * Gate configuration from character.settings.pulse
 */
export interface GateConfig {
  /** Whether the gate is enabled */
  enabled: boolean;
  /** Gate behavior mode */
  mode: GateMode;
  /** Maximum age threshold for considering an agent alive (ISO 8601 duration) */
  threshold: string;
}

/**
 * Pulse settings from character.settings.pulse
 */
export interface PulseGateSettings {
  /** Gate configuration */
  gate: GateConfig;
  /** Pulse contract address */
  contractAddress: `0x${string}`;
  /** Chain ID */
  chainId: number;
  /** Optional RPC URL override */
  rpcUrl?: string;
}

// ============================================================================
// Gate Result Types
// ============================================================================

/**
 * Result of a gate check
 */
export interface GateCheckResult {
  /** Whether the check passed */
  allowed: boolean;
  /** Reason for denial (if not allowed) */
  reason?: string;
  /** Agent status if check was performed */
  status?: AgentStatus;
  /** Seconds since last pulse */
  staleness?: number;
  /** Whether the check was skipped (no pulse settings, non-agent user, etc.) */
  skipped?: boolean;
  /** Skip reason */
  skipReason?: string;
}

/**
 * Gate decision with action recommendation
 */
export interface GateDecision {
  /** Whether to allow the interaction */
  allow: boolean;
  /** Whether to log the interaction */
  log: boolean;
  /** Whether to flag for review */
  flag: boolean;
  /** Message to return if blocked */
  message?: string;
  /** Metadata for logging */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Identity Extraction Types
// ============================================================================

/**
 * Extracted identity from a message
 */
export interface ExtractedIdentity {
  /** Whether an identity was found */
  found: boolean;
  /** Ethereum address if found */
  address?: `0x${string}`;
  /** Identity source (signature, claimed, etc.) */
  source?: "signature" | "claimed" | "inferred" | "none";
  /** Raw identity string */
  raw?: string;
}

// ============================================================================
// Gate State Types
// ============================================================================

/**
 * Gate state tracked per session/conversation
 */
export interface GateState {
  /** Checked identities and their results */
  checkedIdentities: Map<string, GateCheckResult>;
  /** Blocked interactions count */
  blockedCount: number;
  /** Flagged interactions count */
  flaggedCount: number;
  /** Last check timestamp */
  lastCheckAt?: number;
}

/**
 * Gate cache entry for isAlive results
 */
export interface GateCacheEntry {
  /** Cached result */
  result: GateCheckResult;
  /** Cache timestamp */
  cachedAt: number;
  /** TTL in milliseconds */
  ttlMs: number;
}
