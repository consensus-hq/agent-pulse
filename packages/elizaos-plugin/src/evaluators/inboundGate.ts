/**
 * Inbound Gate Evaluator
 *
 * Evaluates incoming messages before any action is taken.
 * Extracts sender identity, checks isAlive(), blocks/flags/logs per mode.
 * Must run before all other evaluators.
 *
 * @module evaluators/inboundGate
 */

import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  elizaLogger,
} from "@elizaos/core";
import {
  extractIdentity,
  isLikelyAgent,
  isAlive,
  makeGateDecision,
  getPulseGateSettings,
} from "../lib/gateUtils.js";
import type { ExtractedIdentity, GateCheckResult } from "../types/index.js";

/**
 * Evaluator name
 */
export const INBOUND_GATE_EVALUATOR = "PULSE_INBOUND_GATE";

/**
 * Inbound Gate Evaluator
 *
 * This evaluator runs before all others to validate incoming messages
 * from external agents based on their pulse status.
 *
 * **Mode behaviors:**
 * - `strict`: Block messages from agents that fail isAlive check
 * - `permissive`: Allow all messages but flag suspicious ones
 * - `audit`: Always allow, log all checks (dry-run mode)
 *
 * **Edge cases handled:**
 * - No pulse settings → no-op (skipped)
 * - RPC unreachable → degrade per mode (strict=block, others=allow)
 * - Non-agent user → skip gate entirely
 */
const inboundGateEvaluator: Evaluator = {
  name: INBOUND_GATE_EVALUATOR,

  description:
    "Validates incoming messages from external agents using the Pulse protocol. " +
    "Extracts sender identity, checks isAlive status, and blocks/flags/logs per mode. " +
    "Runs before all other evaluators.",

  /**
   * Always run for every message - this gate is mandatory
   * The actual filtering happens in the handler
   */
  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    // Check if pulse gate is configured
    const settings = getPulseGateSettings(runtime);
    if (!settings) {
      return false; // Skip - no pulse settings
    }

    // Gate must be enabled
    if (!settings.gate.enabled) {
      return false; // Skip - gate disabled
    }

    return true; // Run the evaluator
  },

  /**
   * Handler performs the actual gate check
   */
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<void> => {
    const settings = getPulseGateSettings(runtime);
    if (!settings) {
      return;
    }

    try {
      // Step 1: Check if sender is likely an agent
      const likelyAgent = isLikelyAgent(message, runtime);
      if (!likelyAgent) {
        elizaLogger.debug("Inbound gate: Skipping non-agent user");
        updateState(state, {
          allowed: true,
          blocked: false,
          flagged: false,
          skipped: true,
          skipReason: "non-agent-user",
        });
        return;
      }

      // Step 2: Extract identity from message
      const identity = extractIdentity(message, runtime);

      if (!identity.found || !identity.address) {
        // No address found - handle per mode
        if (settings.gate.mode === "strict") {
          elizaLogger.warn("Inbound gate: No identity found in strict mode");
          const reason = "No agent identity found (address required in strict mode)";
          
          updateState(state, {
            allowed: false,
            blocked: true,
            flagged: true,
            skipped: false,
            reason,
          });

          if (callback) {
            // Hard reject 403 style
            await callback({
              text: `⛔ Access Denied: ${reason}`,
              error: {
                error: "PULSE_REQUIRED",
                message: reason,
                docs_url: "https://agentpulse.io",
                requester_id: message.userId,
                gate_type: "inbound",
                threshold: settings.gate.threshold,
                last_pulse: 0
              }
            });
          }
          return;
        }

        elizaLogger.debug("Inbound gate: No identity found, skipping check");
        updateState(state, {
          allowed: true,
          blocked: false,
          flagged: false,
          skipped: true,
          skipReason: "no-identity-found",
        });
        return;
      }

      elizaLogger.info(
        `Inbound gate: Checking identity ${identity.address} (source: ${identity.source})`
      );

      // Step 3: Check if agent is alive
      const checkResult = await isAlive(identity.address, settings, runtime);

      // Step 4: Make gate decision based on mode
      const decision = makeGateDecision(settings.gate.mode, checkResult, identity);

      // Step 5: Log if requested
      if (decision.log) {
        logGateDecision("inbound", identity, decision, checkResult);
      }

      // Step 6: Store result in state for other evaluators/actions to use
      if (state) {
        (state as Record<string, unknown>).inboundGateResult = {
          allowed: decision.allow,
          blocked: !decision.allow,
          flagged: decision.flag,
          address: identity.address,
          status: checkResult.status,
          metadata: decision.metadata,
        };

        // Also store for action wrapper to access
        (state as Record<string, unknown>).pulseGateDecision = decision;
      }

      // Step 7: Return appropriate result
      if (!decision.allow) {
        if (callback) {
          const reason = decision.message || checkResult.reason || "PULSE_REQUIRED";
          // Hard reject 403 style
          await callback({
            text: reason,
            error: {
              error: "PULSE_REQUIRED",
              message: reason,
              docs_url: "https://agentpulse.io",
              requester_id: identity.address,
              gate_type: "inbound",
              threshold: settings.gate.threshold,
              last_pulse: checkResult.status?.lastPulse || 0
            }
          });
        }
        return;
      }

      return;
    } catch (error) {
      elizaLogger.error("Inbound gate evaluator error:", String(error));

      // In case of unexpected error, degrade gracefully based on mode
      if (settings.gate.mode === "strict") {
        const reason = `Gate error: ${error instanceof Error ? error.message : String(error)}`;
        
        updateState(state, {
          allowed: false,
          blocked: true,
          flagged: true,
          skipped: false,
          reason,
        });

        if (callback) {
             await callback({
              text: `⛔ Gate Error: ${reason}`,
              error: {
                error: "PULSE_GATE_ERROR",
                message: reason,
                docs_url: "https://agentpulse.io",
                requester_id: message.userId,
                gate_type: "inbound",
                threshold: settings.gate.threshold,
                last_pulse: 0
              }
            });
        }
        return;
      }

      updateState(state, {
        allowed: true,
        blocked: false,
        flagged: false,
        skipped: true,
        skipReason: "gate-error",
      });
      return;
    }
  },

  examples: [],
};

function updateState(state: State | undefined, result: Record<string, unknown>) {
    if (state) {
        (state as Record<string, unknown>).inboundGateResult = result;
    }
}

/**
 * Log a gate decision for audit purposes
 */
function logGateDecision(
  direction: "inbound" | "outbound",
  identity: ExtractedIdentity,
  decision: {
    allow: boolean;
    log: boolean;
    flag: boolean;
    message?: string;
    metadata?: Record<string, unknown>;
  },
  checkResult: GateCheckResult
): void {
  const logData = {
    direction,
    timestamp: new Date().toISOString(),
    address: identity.address,
    identitySource: identity.source,
    decision: decision.allow ? "ALLOW" : "BLOCK",
    flagged: decision.flag,
    mode: checkResult.skipped ? "skipped" : "active",
    reason: checkResult.reason || decision.message,
    metadata: decision.metadata,
  };

  if (decision.flag) {
    elizaLogger.warn("🚩 Gate flag:", JSON.stringify(logData));
  } else if (!decision.allow) {
    elizaLogger.warn("🚫 Gate block:", JSON.stringify(logData));
  } else {
    elizaLogger.info("✅ Gate allow:", JSON.stringify(logData));
  }
}

export default inboundGateEvaluator;
