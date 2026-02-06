/**
 * Agent Pulse ElizaOS Plugin with Gate Functionality
 *
 * Plugin for integrating with the Agent Pulse protocol - an on-chain
 * liveness signal protocol on Base where agents burn PULSE tokens to
 * prove they are alive.
 *
 * This version includes gate functionality:
 * - Inbound gate: Validates incoming messages from external agents
 * - Outbound gate: Checks target pulse status before sending responses
 *
 * @module index
 * @see https://agentpulse.io
 */

import { type Plugin, elizaLogger } from "@elizaos/core";
import { agentPulseEnvSchema, type AgentPulseConfig } from "./environment.js";
import { getPulseGateSettings } from "./lib/gateUtils.js";
import { wrapActionsWithGate } from "./lib/outboundGate.js";
import inboundGateEvaluator from "./evaluators/inboundGate.js";

// Import actions
import sendPulseAction from "./actions/sendPulse.js";
import getStatusAction, { getConfigAction, getHealthAction } from "./actions/getStatus.js";
import getReliabilityAction from "./actions/getReliability.js";
import getLivenessProofAction from "./actions/getLivenessProof.js";
import getGlobalStatsAction from "./actions/getGlobalStats.js";
import getPeerCorrelationAction from "./actions/getPeerCorrelation.js";

// Import providers
import pulseStateProvider from "./providers/pulseState.js";

// ============================================================================
// Re-exports
// ============================================================================

// Types
export type {
  AgentStatus,
  ContractAgentStatus,
  ProtocolConfig,
  ProtocolHealth,
  SendPulseParams,
  PulseResponse,
  PulsePluginState,
  PulseMemory,
  ApiResponse,
  ReliabilityMetrics,
  LivenessProof,
  GlobalStats,
  PeerCorrelation,
  GateMode,
  GateConfig,
  PulseGateSettings,
  GateCheckResult,
  GateDecision,
  ExtractedIdentity,
  GateState,
  GateCacheEntry,
} from "./types/index.js";

// Environment
export {
  agentPulseEnvSchema,
  type AgentPulseConfig,
  isValidAddress,
} from "./environment.js";

// Actions
export { SEND_PULSE_ACTION } from "./actions/sendPulse.js";
export {
  GET_STATUS_ACTION,
  GET_CONFIG_ACTION,
  GET_HEALTH_ACTION,
} from "./actions/getStatus.js";
export { GET_RELIABILITY_ACTION } from "./actions/getReliability.js";
export { GET_LIVENESS_PROOF_ACTION } from "./actions/getLivenessProof.js";
export { GET_GLOBAL_STATS_ACTION } from "./actions/getGlobalStats.js";
export { GET_PEER_CORRELATION_ACTION } from "./actions/getPeerCorrelation.js";

// Providers
export {
  PULSE_STATE_PROVIDER,
  createAgentStatusProvider,
} from "./providers/pulseState.js";

// Evaluators
export {
  INBOUND_GATE_EVALUATOR,
  default as inboundGateEvaluator,
} from "./evaluators/inboundGate.js";

// Gate utilities
export {
  extractIdentity,
  isLikelyAgent,
  isAlive,
  makeGateDecision,
  getPulseGateSettings,
  parseThreshold,
  clearGateCache,
} from "./lib/gateUtils.js";
export { wrapActionWithGate, wrapActionsWithGate } from "./lib/outboundGate.js";

// ============================================================================
// Plugin Configuration
// ============================================================================

/**
 * Base actions array
 */
const baseActions = [
  sendPulseAction,
  getStatusAction,
  getConfigAction,
  getHealthAction,
  getReliabilityAction,
  getLivenessProofAction,
  getGlobalStatsAction,
  getPeerCorrelationAction,
];

/**
 * Agent Pulse Plugin with Gate Functionality
 *
 * **Actions:**
 * - `SEND_PULSE` - Send a liveness pulse (send PULSE tokens to signal sink)
 * - `GET_AGENT_STATUS` - Get agent liveness status
 * - `GET_PROTOCOL_CONFIG` - Get protocol configuration
 * - `GET_PROTOCOL_HEALTH` - Get protocol health status
 * - `GET_RELIABILITY` - Get agent reliability metrics (v2)
 * - `GET_LIVENESS_PROOF` - Get signed liveness proof (v2)
 * - `GET_GLOBAL_STATS` - Get network-wide statistics (v2)
 * - `GET_PEER_CORRELATION` - Get peer correlation analysis (v2)
 *
 * **Evaluators:**
 * - `PULSE_INBOUND_GATE` - Validates incoming messages from external agents
 *   - Must run before all other evaluators
 *   - Extracts sender identity, runs `isAlive()`, blocks/flags/logs per mode
 *
 * **Providers:**
 * - `PULSE_STATE` - Current pulse protocol state
 *
 * **Gate Configuration (via character.settings.pulse):**
 * ```json
 * {
 *   "gate": {
 *     "enabled": true,
 *     "mode": "strict",
 *     "threshold": "24h"
 *   },
 *   "contractAddress": "0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612",
 *   "chainId": 84532
 * }
 * ```
 *
 * **Modes:**
 * - `strict`: Block messages from agents that fail isAlive check
 * - `permissive`: Allow all but flag suspicious ones
 * - `audit`: Always allow, log all (dry-run)
 *
 * **Edge Cases:**
 * - No pulse settings → no-op (gate disabled)
 * - RPC unreachable → degrade per mode (strict=block, others=allow)
 * - Non-agent user → skip gate entirely
 */
const agentPulsePlugin: Plugin = {
  name: "@openclaw/eliza-plugin-pulse",
  description:
    "Agent Pulse protocol integration with gate functionality. " +
    "Validates incoming/outgoing interactions with external agents using on-chain liveness signals.",

  actions: baseActions,

  providers: [pulseStateProvider],

  evaluators: [inboundGateEvaluator],

  services: [],

  /**
   * Initialize the plugin
   * - Validates environment configuration
   * - Wraps actions with outbound gate if enabled
   * - Logs gate configuration if present
   */
  init: async (_config, runtime) => {
    // Validate environment configuration
    const envConfig: AgentPulseConfig = agentPulseEnvSchema.parse({
      AGENT_PULSE_RPC_URL: runtime.getSetting("AGENT_PULSE_RPC_URL"),
      AGENT_PULSE_API_URL: runtime.getSetting("AGENT_PULSE_API_URL"),
      AGENT_PULSE_TOKEN_ADDRESS: runtime.getSetting("AGENT_PULSE_TOKEN_ADDRESS"),
      AGENT_PULSE_REGISTRY_ADDRESS: runtime.getSetting("AGENT_PULSE_REGISTRY_ADDRESS"),
      AGENT_PULSE_DEFAULT_AMOUNT: runtime.getSetting("AGENT_PULSE_DEFAULT_AMOUNT"),
      AGENT_PULSE_CHAIN_ID: runtime.getSetting("AGENT_PULSE_CHAIN_ID"),
      AGENT_PULSE_PRIVATE_KEY: runtime.getSetting("AGENT_PULSE_PRIVATE_KEY"),
      AGENT_PULSE_X402_FACILITATOR: runtime.getSetting("AGENT_PULSE_X402_FACILITATOR"),
      AGENT_PULSE_X402_ENABLED: runtime.getSetting("AGENT_PULSE_X402_ENABLED"),
      AGENT_PULSE_TIMEOUT_MS: runtime.getSetting("AGENT_PULSE_TIMEOUT_MS"),
    });

    // Log initialization
    elizaLogger.log("═══════════════════════════════════════════");
    elizaLogger.log("  @openclaw/eliza-plugin-pulse initialized");
    elizaLogger.log("═══════════════════════════════════════════");
    elizaLogger.log(`  Network: Base Sepolia (${envConfig.AGENT_PULSE_CHAIN_ID})`);
    elizaLogger.log(`  Registry: ${envConfig.AGENT_PULSE_REGISTRY_ADDRESS}`);
    elizaLogger.log(`  Token: ${envConfig.AGENT_PULSE_TOKEN_ADDRESS}`);
    elizaLogger.log(`  API: ${envConfig.AGENT_PULSE_API_URL}`);
    elizaLogger.log(`  x402: ${envConfig.AGENT_PULSE_X402_ENABLED === "true" ? "enabled" : "disabled"}`);

    // Check for gate configuration
    const gateSettings = getPulseGateSettings(runtime);
    if (gateSettings) {
      elizaLogger.log("");
      elizaLogger.log("  🔒 PULSE GATE ENABLED");
      elizaLogger.log(`  Mode: ${gateSettings.gate.mode}`);
      elizaLogger.log(`  Threshold: ${gateSettings.gate.threshold}`);
      elizaLogger.log(`  Contract: ${gateSettings.contractAddress}`);
      elizaLogger.log(`  Chain ID: ${gateSettings.chainId}`);

      // Wrap actions with outbound gate
      agentPulsePlugin.actions = wrapActionsWithGate(baseActions, gateSettings);
      elizaLogger.log("  Outbound gate: Active (actions wrapped)");
    } else {
      elizaLogger.log("");
      elizaLogger.log("  🔓 PULSE GATE DISABLED");
      elizaLogger.log("  (Add settings.pulse to character file to enable)");

      // Use unwrapped actions
      agentPulsePlugin.actions = baseActions;
    }

    elizaLogger.log("═══════════════════════════════════════════");
  },
};

export default agentPulsePlugin;
