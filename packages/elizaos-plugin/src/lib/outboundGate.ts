/**
 * Outbound Gate Middleware
 *
 * Wraps action handlers to check target pulse status before sending responses
 * or calling external agents. Transparently blocks/flags/logs per mode.
 *
 * @module lib/outboundGate
 */

import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  elizaLogger,
} from "@elizaos/core";
import {
  isAlive,
  makeGateDecision,
  getPulseGateSettings,
  type GateCheckResult,
} from "./gateUtils.js";
import type { PulseGateSettings } from "../types/index.js";

/**
 * Target agent info extracted from action context
 */
interface TargetInfo {
  address?: `0x${string}`;
  source: "explicit" | "state" | "message" | "callback";
}

/**
 * Wrap an action handler with outbound gate checks
 * Transparently intercepts action execution to validate target agent status
 */
export function wrapActionWithGate(
  originalAction: Action,
  settings: PulseGateSettings
): Action {
  const originalHandler = originalAction.handler;

  return {
    ...originalAction,

    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State | undefined,
      options: Record<string, unknown> | undefined,
      callback: HandlerCallback | undefined
    ): Promise<void> => {
      // Step 1: Extract target agent from context
      const target = extractTargetAgent(message, state, options, callback);

      if (!target.address) {
        elizaLogger.debug(`Outbound gate: No target agent for action ${originalAction.name}`);
        // No target - proceed with original handler
        return originalHandler(runtime, message, state, options, callback);
      }

      elizaLogger.info(
        `Outbound gate: Checking target ${target.address} for action ${originalAction.name}`
      );

      // Step 2: Check target's pulse status
      const checkResult = await isAlive(target.address, settings, runtime);

      // Step 3: Make gate decision
      const decision = makeGateDecision(
        settings.gate.mode,
        {
          ...checkResult,
          // Override skipped - we have an explicit target
          skipped: false,
        },
        { found: true, address: target.address, source: target.source }
      );

      // Step 4: Log decision
      logOutboundDecision(originalAction.name, target, decision, checkResult);

      // Step 5: Store result in state
      if (state) {
        (state as Record<string, unknown>).outboundGateResult = {
          allowed: decision.allow,
          blocked: !decision.allow,
          flagged: decision.flag,
          targetAddress: target.address,
          actionName: originalAction.name,
          metadata: decision.metadata,
        };
      }

      // Step 6: Handle decision
      if (!decision.allow) {
        // Block the action
        elizaLogger.warn(
          `Outbound gate BLOCKED action ${originalAction.name} to ${target.address}`
        );

        if (callback) {
          const reason = decision.message || 
            `⛔ Cannot perform action: Target agent ${target.address.slice(0, 6)}...${target.address.slice(-4)} is not alive`;
          
          await callback({
            text: reason,
            pulseGateBlocked: true,
            pulseGateReason: checkResult.reason,
            // Strict error schema
            error: {
                error: "PULSE_REQUIRED",
                message: reason,
                docs_url: "https://agentpulse.io",
                requester_id: target.address,
                gate_type: "outbound",
                threshold: settings.gate.threshold,
                last_pulse: checkResult.status?.lastPulse || 0
            }
          });
        }
        return;
      }

      // Step 7: Wrap callback to monitor responses
      const wrappedCallback: HandlerCallback = async (response, files) => {
        // Add gate metadata to response
        const gatedResponse = {
          ...response,
          pulseGateChecked: true,
          pulseGateFlagged: decision.flag,
        };

        if (decision.flag && settings.gate.mode === "permissive") {
          // Append warning for flagged interactions in permissive mode
          gatedResponse.text =
            (gatedResponse.text || "") +
            `\n\n⚠️ *Warning: Target agent ${target.address.slice(0, 6)}...${target.address.slice(-4)} has stale pulse (${checkResult.staleness ? Math.floor(checkResult.staleness / 3600) + "h stale" : "unknown status"})*`;
        }

        return callback?.(gatedResponse, files);
      };

      // Step 8: Proceed with original handler
      return originalHandler(runtime, message, state, options, wrappedCallback);
    },
  };
}

/**
 * Extract target agent address from various sources
 */
function extractTargetAgent(
  message: Memory,
  state?: State,
  options?: Record<string, unknown>,
  callback?: HandlerCallback
): TargetInfo {
  // Priority 1: Explicit option
  if (options?.targetAddress && /^0x[a-fA-F0-9]{40}$/i.test(String(options.targetAddress))) {
    return {
      address: String(options.targetAddress).toLowerCase() as `0x${string}`,
      source: "explicit",
    };
  }

  // Priority 2: State from inbound gate (replying to an agent)
  if (state) {
    const stateRecord = state as Record<string, unknown>;

    // Check for address from inbound gate
    const inboundResult = stateRecord.inboundGateResult as
      | { address?: string }
      | undefined;
    if (inboundResult?.address) {
      return {
        address: inboundResult.address.toLowerCase() as `0x${string}`,
        source: "state",
      };
    }

    // Check for agent status in state
    const agentStatus = stateRecord.agentStatus as { address?: string } | undefined;
    if (agentStatus?.address) {
      return {
        address: agentStatus.address.toLowerCase() as `0x${string}`,
        source: "state",
      };
    }
  }

  // Priority 3: Extract from message text
  const text = message.content.text ?? "";
  const addressMatch = text.match(/(0x[a-fA-F0-9]{40})/i);
  if (addressMatch) {
    return {
      address: addressMatch[1].toLowerCase() as `0x${string}`,
      source: "message",
    };
  }

  // Priority 4: User/room ID that looks like an address
  const userId = message.userId;
  if (userId && /^0x[a-fA-F0-9]{40}$/i.test(userId)) {
    return {
      address: userId.toLowerCase() as `0x${string}`,
      source: "callback",
    };
  }

  return { source: "explicit" };
}

/**
 * Log outbound gate decision
 */
function logOutboundDecision(
  actionName: string,
  target: TargetInfo,
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
    direction: "outbound",
    timestamp: new Date().toISOString(),
    action: actionName,
    targetAddress: target.address,
    targetSource: target.source,
    decision: decision.allow ? "ALLOW" : "BLOCK",
    flagged: decision.flag,
    reason: checkResult.reason || decision.message,
    metadata: decision.metadata,
  };

  if (decision.flag) {
    elizaLogger.warn("🚩 Outbound gate flag:", JSON.stringify(logData));
  } else if (!decision.allow) {
    elizaLogger.warn("🚫 Outbound gate block:", JSON.stringify(logData));
  } else {
    elizaLogger.info("✅ Outbound gate allow:", JSON.stringify(logData));
  }
}

/**
 * Apply outbound gate to all actions in a plugin
 * Returns new array with wrapped actions
 */
export function wrapActionsWithGate(
  actions: Action[],
  settings: PulseGateSettings
): Action[] {
  return actions.map((action) => wrapActionWithGate(action, settings));
}
