/**
 * OpenClaw Skill - AgentPulse Gate Integration
 * Type definitions for the gate configuration and runtime state.
 */

import type { Address } from "viem";
import type { GateMode } from "@agent-pulse/sdk";

// ============================================================================
// Gate Configuration Types
// ============================================================================

/**
 * Gate configuration from skill YAML
 */
export interface GateConfig {
  /** Whether gating is enabled */
  enabled: boolean;
  /** Gating mode: strict (reject), warn (log+proceed), log (telemetry only) */
  mode: GateMode;
  /** Duration threshold for liveness check (e.g., "24h", "30m") */
  threshold: string;
  /** Optional chain ID (default: 84532 for Base Sepolia) */
  chainId?: number;
  /** Optional custom RPC URL */
  rpcUrl?: string;
  /** Optional contract address overrides */
  contracts?: {
    pulseToken?: Address;
    pulseRegistry?: Address;
  };
}

/**
 * Parsed threshold duration
 */
export interface ParsedThreshold {
  /** Numeric value */
  value: number;
  /** Unit of time */
  unit: "s" | "m" | "h" | "d" | "w";
  /** Total seconds */
  seconds: number;
}

// ============================================================================
// Runtime Gate Types
// ============================================================================

/**
 * Gate runtime status
 */
export interface GateRuntimeStatus {
  /** Whether gate is currently active */
  active: boolean;
  /** Current mode */
  mode: GateMode;
  /** Threshold duration string */
  threshold: string;
  /** SDK initialization status */
  sdkInitialized: boolean;
  /** Last error message (if any) */
  lastError?: string;
  /** Timestamp of last successful check */
  lastCheck?: number;
}

/**
 * Gate check result
 */
export interface GateCheckResult {
  /** Whether the check passed */
  allowed: boolean;
  /** Agent address checked */
  address: Address;
  /** Direction of check */
  direction: "incoming" | "outgoing";
  /** Whether agent is alive */
  isAlive: boolean;
  /** Timestamp of check */
  timestamp: number;
  /** Error message (if rejected) */
  error?: string;
}

/**
 * Gate statistics for status reporting
 */
export interface GateStats {
  /** Total number of agents checked */
  agentsChecked: number;
  /** Number of agents rejected */
  agentsRejected: number;
  /** Number of incoming checks */
  incomingChecks: number;
  /** Number of outgoing checks */
  outgoingChecks: number;
  /** Number of SDK errors */
  sdkErrors: number;
  /** Last check timestamp */
  lastCheck: number | null;
}

// ============================================================================
// Skill Status Types
// ============================================================================

/**
 * Gate section in skill status output
 */
export interface GateStatusOutput {
  /** Whether gating is enabled */
  enabled: boolean;
  /** Current gating mode */
  mode: GateMode;
  /** Threshold duration */
  threshold: string;
  /** Gate status: active, degraded, or disabled */
  status: "active" | "degraded" | "disabled";
  /** Timestamp of last check */
  lastCheck: number | null;
  /** Statistics */
  stats: GateStats;
  /** SDK configuration (sanitized) */
  config: {
    chainId: number;
    hasCustomRpc: boolean;
    hasCustomContracts: boolean;
  };
}

// ============================================================================
// Skill Integration Types
// ============================================================================

/**
 * Context passed to skill actions/evaluators
 */
export interface SkillContext {
  /** Gate instance for manual checks */
  gate?: OpenClawGate;
  /** Gate status */
  gateStatus: GateRuntimeStatus;
}

/**
 * OpenClaw Gate interface exposed to skills
 */
export interface OpenClawGate {
  /** Check incoming request */
  gateIncoming(requesterAddr: Address): Promise<boolean>;
  /** Check outgoing request */
  gateOutgoing(targetAddr: Address): Promise<boolean>;
  /** Get current status */
  getStatus(): GateRuntimeStatus;
  /** Get statistics */
  getStats(): GateStats;
}

/**
 * Skill startup result
 */
export interface SkillStartupResult {
  /** Whether startup succeeded */
  success: boolean;
  /** Gate instance (if initialized) */
  gate?: OpenClawGate;
  /** Error message (if failed) */
  error?: string;
  /** Status */
  status: GateRuntimeStatus;
}
