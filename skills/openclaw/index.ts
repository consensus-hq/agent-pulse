/**
 * OpenClaw Skill - AgentPulse Gate Integration
 * 
 * Main implementation of the OpenClaw skill framework integration.
 * Provides startup hook, gate activation, and status reporting.
 * 
 * @module openclaw-skill
 */

import { type Address, isAddress } from "viem";
import {
  AgentPulse,
  AgentPulseGate,
  type GateMode,
  type GateOptions,
  AgentPulseError,
} from "@agent-pulse/sdk";
import { Ajv } from "ajv";

import type {
  GateConfig,
  ParsedThreshold,
  GateRuntimeStatus,
  GateStats,
  GateStatusOutput,
  OpenClawGate as IOpenClawGate,
  SkillStartupResult,
} from "./types.js";

import gateSchema from "./gate-schema.json" with { type: "json" };

// ============================================================================
// Constants
// ============================================================================

/** Default chain ID (Base Sepolia) */
const DEFAULT_CHAIN_ID = 84532;

/** Duration unit multipliers (to seconds) */
const DURATION_MULTIPLIERS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validate gate configuration against JSON Schema
 */
export function validateGateConfig(config: unknown): config is GateConfig {
  const ajv = new Ajv({ strict: false });
  const validate = ajv.compile(gateSchema);
  return validate(config) === true;
}

/**
 * Parse duration string to seconds
 * @param threshold - Duration string (e.g., "24h", "30m")
 * @returns Parsed threshold or null if invalid
 */
export function parseThreshold(threshold: string): ParsedThreshold | null {
  const match = threshold.match(/^(\d+)([smhdw])$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2] as ParsedThreshold["unit"];
  const multiplier = DURATION_MULTIPLIERS[unit];

  return {
    value,
    unit,
    seconds: value * multiplier,
  };
}

// ============================================================================
// OpenClawGate Implementation
// ============================================================================

/**
 * OpenClaw Gate implementation wrapping AgentPulse SDK
 */
class OpenClawGate implements IOpenClawGate {
  private gate: AgentPulseGate;
  private config: GateConfig;
  private _status: GateRuntimeStatus;
  private _stats: GateStats;

  constructor(gate: AgentPulseGate, config: GateConfig) {
    this.gate = gate;
    this.config = config;

    this._status = {
      active: true,
      mode: config.mode,
      threshold: config.threshold,
      sdkInitialized: true,
      lastCheck: Date.now(),
    };

    this._stats = {
      agentsChecked: 0,
      agentsRejected: 0,
      incomingChecks: 0,
      outgoingChecks: 0,
      sdkErrors: 0,
      lastCheck: null,
    };
  }

  /**
   * Gate an incoming request
   * @param requesterAddr - Address of the requesting agent
   * @returns true if allowed, throws in strict mode if rejected
   */
  async gateIncoming(requesterAddr: Address): Promise<boolean> {
    return this.performCheck("incoming", requesterAddr);
  }

  /**
   * Gate an outgoing request
   * @param targetAddr - Address of the target agent
   * @returns true if allowed, throws in strict mode if rejected
   */
  async gateOutgoing(targetAddr: Address): Promise<boolean> {
    return this.performCheck("outgoing", targetAddr);
  }

  /**
   * Internal check implementation
   */
  private async performCheck(
    direction: "incoming" | "outgoing",
    address: Address
  ): Promise<boolean> {
    // Update stats
    this._stats.agentsChecked++;
    if (direction === "incoming") {
      this._stats.incomingChecks++;
    } else {
      this._stats.outgoingChecks++;
    }

    const timestamp = Date.now();

    try {
      // Use the SDK gate based on direction
      const allowed = direction === "incoming"
        ? await this.gate.gateIncoming(address)
        : await this.gate.gateOutgoing(address);

      this._stats.lastCheck = timestamp;
      this._status.lastCheck = timestamp;

      if (!allowed) {
        this._stats.agentsRejected++;

        // In strict mode, gateIncoming/gateOutgoing already threw
        // This handles any additional rejection logic
        if (this.config.mode === "strict") {
          throw new AgentPulseError(
            `[OpenClawGate] ${direction} agent ${address} is NOT alive - request rejected`,
            "API_ERROR",
            403
          );
        }
      }

      return allowed;
    } catch (error) {
      this._stats.sdkErrors++;

      if (error instanceof AgentPulseError) {
        throw error;
      }

      // Handle unexpected errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[OpenClawGate] Error during ${direction} check:`, errorMsg);

      // In strict mode, fail closed (reject)
      if (this.config.mode === "strict") {
        throw new AgentPulseError(
          `[OpenClawGate] Gate check failed: ${errorMsg}`,
          "API_ERROR",
          500
        );
      }

      // In warn/log mode, fail open (allow)
      return true;
    }
  }

  /**
   * Get current gate status
   */
  getStatus(): GateRuntimeStatus {
    return { ...this._status };
  }

  /**
   * Get gate statistics
   */
  getStats(): GateStats {
    return { ...this._stats };
  }

  /**
   * Get full status output for orchestrator queries
   */
  getStatusOutput(): GateStatusOutput {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      threshold: this.config.threshold,
      status: this._status.active ? "active" : "degraded",
      lastCheck: this._status.lastCheck || null,
      stats: this.getStats(),
      config: {
        chainId: this.config.chainId || DEFAULT_CHAIN_ID,
        hasCustomRpc: !!this.config.rpcUrl,
        hasCustomContracts: !!this.config.contracts,
      },
    };
  }
}

// ============================================================================
// Skill Startup Hook
// ============================================================================

/**
 * Skill startup hook - initializes AgentPulse SDK
 * 
 * This MUST be called before any skill action/evaluator runs.
 * Gate initialization failure is surfaced based on mode:
 * - strict: Throws error, skill startup fails
 * - warn: Logs warning, continues without gating
 * - log: Silent, continues without gating
 * 
 * @param config - Gate configuration from skill YAML
 * @returns Skill startup result with gate instance
 */
export async function startup(config: unknown): Promise<SkillStartupResult> {
  // Check if gating is configured
  if (!config || typeof config !== "object") {
    return {
      success: true,
      status: {
        active: false,
        mode: "log" as GateMode,
        threshold: "",
        sdkInitialized: false,
      },
    };
  }

  // Extract raw mode before validation for error handling
  const raw = config as Record<string, unknown>;
  const requestedMode = (
    raw["mode"] === "strict" || raw["mode"] === "warn" || raw["mode"] === "log"
      ? raw["mode"]
      : "log"
  ) as GateMode;

  // If disabled, return early
  if (!raw["enabled"]) {
    console.log("[OpenClawSkill] Gate is disabled, skipping initialization");
    return {
      success: true,
      status: {
        active: false,
        mode: "log" as GateMode,
        threshold: "",
        sdkInitialized: false,
      },
    };
  }

  // Validate configuration
  if (!validateGateConfig(config)) {
    const error = "[OpenClawSkill] Invalid gate configuration";
    console.error(error);

    // In strict mode, fail startup
    if (requestedMode === "strict") {
      return {
        success: false,
        error,
        status: {
          active: false,
          mode: requestedMode,
          threshold: (raw["threshold"] as string) || "",
          sdkInitialized: false,
          lastError: error,
        },
      };
    }

    // In warn/log mode, continue without gating
    return {
      success: true,
      status: {
        active: false,
        mode: requestedMode,
        threshold: (raw["threshold"] as string) || "",
        sdkInitialized: false,
        lastError: error,
      },
    };
  }

  // config is now validated as GateConfig
  const gateConfig: GateConfig = config;

  // Parse and validate threshold
  const parsedThreshold = parseThreshold(gateConfig.threshold);
  if (!parsedThreshold) {
    const error = `[OpenClawSkill] Invalid threshold format: ${gateConfig.threshold}`;
    console.error(error);

    if (gateConfig.mode === "strict") {
      return {
        success: false,
        error,
        status: {
          active: false,
          mode: gateConfig.mode,
          threshold: gateConfig.threshold,
          sdkInitialized: false,
          lastError: error,
        },
      };
    }
  }

  // Initialize AgentPulse SDK
  try {
    console.log(`[OpenClawSkill] Initializing AgentPulse SDK (mode: ${gateConfig.mode})...`);

    const pulse = new AgentPulse({
      chainId: gateConfig.chainId || DEFAULT_CHAIN_ID,
      rpcUrl: gateConfig.rpcUrl,
      contracts: gateConfig.contracts,
    });

    // Test SDK connection with a health check
    const health = await pulse.getHealth();
    console.log(`[OpenClawSkill] AgentPulse protocol health: ${health.health}`);

    // Create gate with mode-specific options
    const gateOptions: GateOptions = {
      mode: gateConfig.mode,
      gateIncoming: true,
      gateOutgoing: true,
      threshold: gateConfig.threshold,
      logger: {
        warn: (msg: string) => console.warn(msg),
        error: (msg: string) => console.error(msg),
        info: (msg: string) => console.info(msg),
      },
    };

    const sdkGate = pulse.createGate(gateOptions);
    const openClawGate = new OpenClawGate(sdkGate, gateConfig);

    console.log(`[OpenClawSkill] Gate initialized successfully (threshold: ${gateConfig.threshold})`);

    return {
      success: true,
      gate: openClawGate,
      status: openClawGate.getStatus(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[OpenClawSkill] Failed to initialize AgentPulse SDK: ${errorMsg}`);

    // Surface error based on mode
    if (gateConfig.mode === "strict") {
      return {
        success: false,
        error: `[OpenClawSkill] Gate init failed (strict mode): ${errorMsg}`,
        status: {
          active: false,
          mode: gateConfig.mode,
          threshold: gateConfig.threshold,
          sdkInitialized: false,
          lastError: errorMsg,
        },
      };
    }

    // In warn mode, log and continue
    if (gateConfig.mode === "warn") {
      console.warn("[OpenClawSkill] Gate initialization failed, continuing without gating (warn mode)");
    }

    // In log mode, silent continue
    return {
      success: true,
      status: {
        active: false,
        mode: gateConfig.mode,
        threshold: gateConfig.threshold,
        sdkInitialized: false,
        lastError: errorMsg,
      },
    };
  }
}

// ============================================================================
// Pre-Action Gate Activation
// ============================================================================

/**
 * Middleware that activates gate BEFORE any skill action/evaluator
 * 
 * Usage in skill definition:
 * ```typescript
 * actions: {
 *   myAction: withGate((ctx, input) => { ... })
 * }
 * ```
 */
export function withGate<TInput, TOutput>(
  action: (ctx: { gate?: IOpenClawGate }, input: TInput) => Promise<TOutput>,
  options?: { direction?: "incoming" | "outgoing"; address?: Address }
) {
  return async (ctx: { gate?: IOpenClawGate }, input: TInput & { from?: Address; to?: Address }): Promise<TOutput> => {
    if (ctx.gate) {
      const direction = options?.direction || "incoming";
      const address = options?.address || input.from || input.to;

      if (address && isAddress(address)) {
        if (direction === "incoming") {
          await ctx.gate.gateIncoming(address);
        } else {
          await ctx.gate.gateOutgoing(address);
        }
      }
    }

    return action(ctx, input);
  };
}

// ============================================================================
// Status Query Handler
// ============================================================================

/**
 * Get gate status for orchestrator queries
 * @param gate - Gate instance (if initialized)
 * @returns Gate status output
 */
export function getGateStatus(gate?: IOpenClawGate): GateStatusOutput | null {
  if (!gate) {
    return null;
  }

  // OpenClawGate has getStatusOutput method
  if (gate instanceof OpenClawGate) {
    return gate.getStatusOutput();
  }

  // Fallback for generic gate interface
  const status = gate.getStatus();
  const stats = gate.getStats();

  return {
    enabled: status.active,
    mode: status.mode,
    threshold: status.threshold,
    status: status.active ? "active" : "degraded",
    lastCheck: status.lastCheck || null,
    stats,
    config: {
      chainId: DEFAULT_CHAIN_ID,
      hasCustomRpc: false,
      hasCustomContracts: false,
    },
  };
}

// ============================================================================
// Exports
// ============================================================================

export { OpenClawGate };
export type { GateConfig, GateStatusOutput, SkillStartupResult };
