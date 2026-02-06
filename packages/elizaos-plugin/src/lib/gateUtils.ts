/**
 * Gate Utilities
 *
 * Helper functions for the Pulse Gate functionality.
 * @module lib/gateUtils
 */

import { elizaLogger, type IAgentRuntime, type Memory } from "@elizaos/core";
import type {
  AgentStatus,
  GateCacheEntry,
  GateCheckResult,
  GateConfig,
  GateDecision,
  GateMode,
  ExtractedIdentity,
  PulseGateSettings,
} from "../types/index.js";
import type { AgentPulseConfig } from "../environment.js";

// ============================================================================
// Identity Extraction
// ============================================================================

/**
 * Extract identity from a message
 * Looks for Ethereum addresses in message text, user metadata, or signatures
 */
export function extractIdentity(
  message: Memory,
  runtime?: IAgentRuntime
): ExtractedIdentity {
  const text = message.content.text ?? "";

  // 1. Check for signed message with address (highest confidence)
  // Pattern: message signed by an address in metadata
  const userId = message.userId;
  const senderId = message.agentId ? String(message.agentId) : undefined;

  // 2. Look for Ethereum address in message content
  const addressMatch = text.match(/(0x[a-fA-F0-9]{40})/i);
  if (addressMatch) {
    return {
      found: true,
      address: addressMatch[1] as `0x${string}`,
      source: "claimed",
      raw: addressMatch[1],
    };
  }

  // 3. Check if senderId is an address
  if (senderId && /^0x[a-fA-F0-9]{40}$/i.test(senderId)) {
    return {
      found: true,
      address: senderId as `0x${string}`,
      source: "inferred",
      raw: senderId,
    };
  }

  // 4. Check user metadata if available
  if (message.content.metadata && typeof message.content.metadata === "object") {
    const metadata = message.content.metadata as Record<string, unknown>;
    if (metadata.address && /^0x[a-fA-F0-9]{40}$/i.test(String(metadata.address))) {
      return {
        found: true,
        address: String(metadata.address) as `0x${string}`,
        source: "claimed",
        raw: String(metadata.address),
      };
    }
  }

  return {
    found: false,
    source: "none",
  };
}

/**
 * Check if a user is likely an agent (vs a human)
 * Heuristics based on message patterns, metadata, or explicit markers
 */
export function isLikelyAgent(
  message: Memory,
  runtime?: IAgentRuntime
): boolean {
  const text = message.content.text ?? "";
  const lowerText = text.toLowerCase();

  // Check for agent-like identifiers in message metadata
  if (message.content.metadata && typeof message.content.metadata === "object") {
    const metadata = message.content.metadata as Record<string, unknown>;
    if (metadata.isAgent === true) return true;
    if (metadata.agentType) return true;
    if (metadata.address && /^0x[a-fA-F0-9]{40}$/i.test(String(metadata.address))) {
      return true;
    }
  }

  // Check user ID patterns that suggest agents
  const userId = message.userId;
  if (userId) {
    // Agent IDs often contain specific patterns
    if (/^0x[a-fA-F0-9]{40}$/i.test(userId)) return true;
    if (userId.includes("agent") || userId.includes("bot")) return true;
  }

  // Check for agent-like communication patterns
  const agentPatterns = [
    /\b0x[a-fA-F0-9]{40}\b/, // Contains ethereum address
    /\bpulse\b/i,
    /\bagent\b/i,
    /\bproof of liveness\b/i,
    /\bstake\b/i,
    /\bsmart contract\b/i,
    /\bon-chain\b/i,
  ];

  // If multiple agent patterns match, likely an agent
  const matchCount = agentPatterns.filter((p) => p.test(text)).length;
  if (matchCount >= 2) return true;

  // Check sender name if available
  const senderName = message.content.name ?? message.userId;
  if (senderName) {
    const lowerName = String(senderName).toLowerCase();
    if (lowerName.includes("agent") || lowerName.includes("bot")) return true;
  }

  return false;
}

// ============================================================================
// Threshold Parsing
// ============================================================================

/**
 * Parse ISO 8601 duration string to seconds
 * Supports formats like: "24h", "1d", "PT24H", "P1D"
 */
export function parseThreshold(threshold: string): number {
  // Handle simple formats first
  const simpleMatch = threshold.match(/^(\d+)([dhms])$/i);
  if (simpleMatch) {
    const value = parseInt(simpleMatch[1], 10);
    const unit = simpleMatch[2].toLowerCase();
    switch (unit) {
      case "d":
        return value * 24 * 3600;
      case "h":
        return value * 3600;
      case "m":
        return value * 60;
      case "s":
        return value;
    }
  }

  // Handle ISO 8601 duration format (PT24H, P1DT6H, etc.)
  const isoMatch = threshold.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (isoMatch) {
    const days = parseInt(isoMatch[1] ?? "0", 10);
    const hours = parseInt(isoMatch[2] ?? "0", 10);
    const minutes = parseInt(isoMatch[3] ?? "0", 10);
    const seconds = parseInt(isoMatch[4] ?? "0", 10);
    return days * 24 * 3600 + hours * 3600 + minutes * 60 + seconds;
  }

  // Default to 24 hours if parsing fails
  elizaLogger.warn(`Failed to parse threshold "${threshold}", defaulting to 24h`);
  return 24 * 3600;
}

// ============================================================================
// IsAlive Check
// ============================================================================

// Simple in-memory cache for gate results
const gateCache = new Map<string, GateCacheEntry>();
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Check if an agent is alive via the Pulse API
 */
export async function isAlive(
  address: `0x${string}`,
  config: PulseGateSettings,
  runtime?: IAgentRuntime
): Promise<GateCheckResult> {
  const cacheKey = `${address.toLowerCase()}_${config.contractAddress}`;

  // Check cache first
  const cached = gateCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < cached.ttlMs) {
    elizaLogger.debug(`Using cached gate result for ${address}`);
    return cached.result;
  }

  try {
    // Determine API URL
    const apiUrl =
      config.gate.enabled && runtime
        ? (runtime.getSetting("AGENT_PULSE_API_URL") ?? "https://api.agentpulse.io")
        : "https://api.agentpulse.io";

    // Fetch agent status from API
    const response = await fetch(`${apiUrl}/api/status/${address}`, {
      headers: { Accept: "application/json" },
      // Short timeout to fail fast
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        const result: GateCheckResult = {
          allowed: false,
          reason: "Agent never pulsed - not registered",
          skipped: false,
        };
        cacheResult(cacheKey, result, CACHE_TTL_MS);
        return result;
      }
      throw new Error(`Status API error: ${response.status}`);
    }

    const status = (await response.json()) as AgentStatus;
    const thresholdSeconds = parseThreshold(config.gate.threshold);

    // Calculate staleness
    const now = Math.floor(Date.now() / 1000);
    const staleness = now - status.lastPulse;

    // Determine if alive based on threshold
    const withinThreshold = staleness <= thresholdSeconds;

    const result: GateCheckResult = {
      allowed: withinThreshold,
      reason: withinThreshold
        ? undefined
        : `Agent stale for ${formatDuration(staleness)} (threshold: ${config.gate.threshold})`,
      status,
      staleness,
      skipped: false,
    };

    // Cache the result
    cacheResult(cacheKey, result, CACHE_TTL_MS);

    return result;
  } catch (error) {
    elizaLogger.error(`Error checking isAlive for ${address}:`, String(error));

    // Return degraded result based on mode
    const errorResult: GateCheckResult = {
      allowed: config.gate.mode !== "strict", // Allow if not strict
      reason: `RPC/API unreachable: ${error instanceof Error ? error.message : String(error)}`,
      skipped: false,
    };

    // Cache error results for shorter time
    cacheResult(cacheKey, errorResult, 10000);

    return errorResult;
  }
}

/**
 * Cache a gate check result
 */
function cacheResult(key: string, result: GateCheckResult, ttlMs: number): void {
  gateCache.set(key, {
    result,
    cachedAt: Date.now(),
    ttlMs,
  });
}

/**
 * Clear the gate cache
 */
export function clearGateCache(): void {
  gateCache.clear();
}

// ============================================================================
// Gate Decision Logic
// ============================================================================

/**
 * Make a gate decision based on mode and check result
 */
export function makeGateDecision(
  mode: GateMode,
  checkResult: GateCheckResult,
  identity: ExtractedIdentity
): GateDecision {
  // If check was skipped, allow and don't log
  if (checkResult.skipped) {
    return {
      allow: true,
      log: false,
      flag: false,
      metadata: { skipped: true, reason: checkResult.skipReason },
    };
  }

  switch (mode) {
    case "strict":
      return {
        allow: checkResult.allowed,
        log: true,
        flag: !checkResult.allowed,
        message: checkResult.allowed
          ? undefined
          : `⛔ Access denied: ${checkResult.reason}`,
        metadata: {
          address: identity.address,
          status: checkResult.status,
          staleness: checkResult.staleness,
        },
      };

    case "permissive":
      // Allow but flag suspicious
      return {
        allow: true,
        log: true,
        flag: !checkResult.allowed,
        metadata: {
          address: identity.address,
          warning: checkResult.allowed ? undefined : checkResult.reason,
          status: checkResult.status,
          staleness: checkResult.staleness,
        },
      };

    case "audit":
      // Always allow but always log
      return {
        allow: true,
        log: true,
        flag: !checkResult.allowed,
        metadata: {
          address: identity.address,
          wouldBlock: !checkResult.allowed,
          blockReason: checkResult.reason,
          status: checkResult.status,
          staleness: checkResult.staleness,
        },
      };

    default:
      return {
        allow: true,
        log: false,
        flag: false,
      };
  }
}

// ============================================================================
// Settings Extraction
// ============================================================================

/**
 * Get Pulse gate settings from runtime
 * Returns null if no pulse settings configured
 */
export function getPulseGateSettings(runtime: IAgentRuntime): PulseGateSettings | null {
  // Get settings from character.settings.pulse
  const pulseSettings = runtime.character?.settings?.pulse;

  if (!pulseSettings) {
    return null;
  }

  // Validate required fields
  const gate = pulseSettings.gate;
  if (!gate || typeof gate.enabled !== "boolean") {
    return null;
  }

  // Ensure we have contract address
  const contractAddress = pulseSettings.contractAddress;
  if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/i.test(contractAddress)) {
    elizaLogger.warn("Invalid or missing contractAddress in pulse settings");
    return null;
  }

  return {
    gate: {
      enabled: gate.enabled,
      mode: gate.mode || "strict",
      threshold: gate.threshold || "24h",
    },
    contractAddress: contractAddress as `0x${string}`,
    chainId: pulseSettings.chainId || 84532,
    rpcUrl: pulseSettings.rpcUrl,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format seconds as human readable duration
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
