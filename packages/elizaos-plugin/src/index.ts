/**
 * Agent Pulse ElizaOS Plugin
 * 
 * Plugin for integrating with the Agent Pulse protocol - an on-chain
 * liveness signal protocol on Base where agents burn PULSE tokens to
 * prove they are alive.
 * 
 * @module index
 * @see https://agentpulse.io
 */

import { type Plugin } from "@elizaos/core";
import { agentPulseEnvSchema, type AgentPulseConfig } from "./environment.ts";
import sendPulseAction from "./actions/sendPulse.ts";
import getStatusAction, { getConfigAction, getHealthAction } from "./actions/getStatus.ts";
import pulseStateProvider from "./providers/pulseState.ts";

// Re-export types
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
} from "./types.ts";

// Re-export environment
export { 
  agentPulseEnvSchema, 
  type AgentPulseConfig,
  isValidAddress,
} from "./environment.ts";

// Re-export actions
export { SEND_PULSE_ACTION } from "./actions/sendPulse.ts";
export { 
  GET_STATUS_ACTION, 
  GET_CONFIG_ACTION, 
  GET_HEALTH_ACTION 
} from "./actions/getStatus.ts";

// Re-export providers
export { 
  PULSE_STATE_PROVIDER,
  createAgentStatusProvider,
} from "./providers/pulseState.ts";

/**
 * Agent Pulse Plugin
 * 
 * Provides actions and providers for interacting with the Agent Pulse protocol:
 * 
 * **Actions:**
 * - `SEND_PULSE` - Send a liveness pulse (burn PULSE tokens)
 * - `GET_AGENT_STATUS` - Get agent liveness status
 * - `GET_PROTOCOL_CONFIG` - Get protocol configuration
 * - `GET_PROTOCOL_HEALTH` - Get protocol health status
 * 
 * **Providers:**
 * - `PULSE_STATE` - Current pulse protocol state
 * 
 * **Environment Variables:**
 * - `AGENT_PULSE_RPC_URL` - Base Sepolia RPC URL
 * - `AGENT_PULSE_API_URL` - Agent Pulse API endpoint
 * - `AGENT_PULSE_TOKEN_ADDRESS` - PULSE token contract
 * - `AGENT_PULSE_REGISTRY_ADDRESS` - PulseRegistry contract
 * - `AGENT_PULSE_DEFAULT_AMOUNT` - Default pulse amount (wei)
 * - `AGENT_PULSE_CHAIN_ID` - Chain ID (84532 for Base Sepolia)
 * - `AGENT_PULSE_PRIVATE_KEY` - Optional signing key
 * - `AGENT_PULSE_X402_ENABLED` - Enable x402 payments
 * - `AGENT_PULSE_X402_FACILITATOR` - x402 facilitator URL
 */
const agentPulsePlugin: Plugin = {
  name: "agent-pulse",
  description: 
    "Agent Pulse protocol integration - on-chain liveness signaling on Base. " +
    "Send pulses, check agent status, and monitor protocol health.",

  actions: [
    sendPulseAction,
    getStatusAction,
    getConfigAction,
    getHealthAction,
  ],

  providers: [pulseStateProvider],

  evaluators: [],

  services: [],

  /**
   * Initialize the plugin
   */
  init: async (runtime) => {
    // Validate environment configuration
    const config: AgentPulseConfig = agentPulseEnvSchema.parse({
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
    const logger = runtime.getLogger?.() ?? console;
    logger.log("Agent Pulse plugin initialized");
    logger.log(`  Network: Base Sepolia (${config.AGENT_PULSE_CHAIN_ID})`);
    logger.log(`  Registry: ${config.AGENT_PULSE_REGISTRY_ADDRESS}`);
    logger.log(`  Token: ${config.AGENT_PULSE_TOKEN_ADDRESS}`);
    logger.log(`  API: ${config.AGENT_PULSE_API_URL}`);
    logger.log(`  x402: ${config.AGENT_PULSE_X402_ENABLED === "true" ? "enabled" : "disabled"}`);

    return {
      success: true,
      message: "Agent Pulse plugin initialized successfully",
    };
  },
};

export default agentPulsePlugin;