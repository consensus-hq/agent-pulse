/**
 * Get Status Action
 * 
 * Action to retrieve agent status from the Agent Pulse protocol.
 * 
 * @module actions/getStatus
 */

import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  elizaLogger,
} from "@elizaos/core";
import type { AgentStatus, ProtocolConfig, ProtocolHealth } from "../types";
import { isValidAddress } from "../environment";

/**
 * Action name for getAgentStatus
 */
export const GET_STATUS_ACTION = "GET_AGENT_STATUS";
export const GET_CONFIG_ACTION = "GET_PROTOCOL_CONFIG";
export const GET_HEALTH_ACTION = "GET_PROTOCOL_HEALTH";

/**
 * Get agent status action
 * 
 * Retrieves the current liveness status of an agent including
 * last pulse time, streak, hazard score, and TTL.
 */
const getStatusAction: Action = {
  name: GET_STATUS_ACTION,

  description:
    "Get the current status of an agent from the Agent Pulse protocol. Returns liveness status, last pulse time, streak count, hazard score, and remaining TTL.",

  similes: [
    "CHECK_STATUS",
    "GET_AGENT_STATUS",
    "STATUS_CHECK",
    "AM_I_ALIVE",
    "PULSE_STATUS",
    "AGENT_HEALTH",
    "LIVENESS_CHECK",
    "STREAK_STATUS",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Check my agent status" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Agent status: Alive ✅\nLast pulse: 2 hours ago\nStreak: 5 days\nHazard: 0/100",
          action: GET_STATUS_ACTION,
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Is 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb alive?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Agent status: Dead ❌\nLast pulse: 3 days ago\nTTL expired",
          action: GET_STATUS_ACTION,
        },
      },
    ],
  ] as ActionExample[][],


  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() ?? "";
    
    // Check for status-related keywords
    const hasStatusKeyword =
      /\b(status|alive|health|check.*agent|my agent|streak|hazard)\b/.test(text);
    
    // Check for ethereum address
    const hasAddress = /0x[a-fA-F0-9]{40}/.test(text);
    
    return hasStatusKeyword || hasAddress;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<void> => {
    elizaLogger.info("GET_AGENT_STATUS action triggered");

    try {
      const apiUrl = runtime.getSetting("AGENT_PULSE_API_URL") ?? "https://api.agentpulse.io";

      
      // Parse address from message or options
      const text = message.content.text ?? "";
      const addressMatch = text.match(/(0x[a-fA-F0-9]{40})/i);
      const address = (options?.address as string) ?? addressMatch?.[1];

      if (!address || !isValidAddress(address)) {
        if (callback) {
          await callback({
            text: "Please provide a valid agent Ethereum address (0x...) to check status.",
          });
        }
        return;
      }

      elizaLogger.info(`Fetching status for ${address}`);

      // Fetch agent status
      const response = await fetch(`${apiUrl}/api/status/${address}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        if (response.status === 404) {
          if (callback) {
            await callback({
              text: `Agent ${address} not found. This address has never sent a pulse.`,
            });
          }
          return;
        }
        throw new Error(`Status API error: ${response.status}`);
      }

      const status = await response.json() as AgentStatus;

      // Format status message
      const lastPulseTime = new Date(status.lastPulse * 1000).toLocaleString();
      const timeSince = formatTimeSince(status.lastPulse);
      const ttlRemaining = Math.max(0, status.ttlSeconds - (Date.now() / 1000 - status.lastPulse));
      
      const statusText = status.alive 
        ? "🟢 Alive" 
        : "🔴 Dead (TTL Expired)";
      
      const hazardEmoji = status.hazardScore > 50 ? "⚠️" : "✅";

      const message_text = 
        `**Agent Status: ${address.slice(0, 6)}...${address.slice(-4)}**\n\n` +
        `${statusText}\n` +
        `• Last Pulse: ${timeSince} ago (${lastPulseTime})\n` +
        `• Streak: 🔥 ${status.streak} day${status.streak !== 1 ? 's' : ''}\n` +
        `• Hazard Score: ${hazardEmoji} ${status.hazardScore}/100\n` +
        `• TTL: ${Math.floor(ttlRemaining / 3600)}h ${Math.floor((ttlRemaining % 3600) / 60)}m remaining`;

      // Update state
      const newState = {
        ...state,
        agentStatus: status,
      };

      if (callback) {
        await callback({
          text: message_text,
          ...newState,
        });
      }

      elizaLogger.info(`Status retrieved for ${address}: alive=${status.alive}`);

    } catch (error) {
      elizaLogger.error("Error getting agent status:", String(error));
      
      if (callback) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await callback({
          text: `❌ Failed to get status: ${errorMessage}`,
        });
      }
    }
  },
};

/**
 * Get protocol config action
 * 
 * Retrieves protocol configuration including contract addresses,
 * network settings, and x402 configuration.
 */
export const getConfigAction: Action = {
  name: GET_CONFIG_ACTION,

  description:
    "Get the Agent Pulse protocol configuration including contract addresses, network settings, and x402 payment configuration.",

  similes: [
    "GET_CONFIG",
    "PROTOCOL_CONFIG",
    "SHOW_CONFIG",
    "CONTRACT_ADDRESSES",
    "NETWORK_INFO",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Show protocol config" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Protocol Config:\nNetwork: Base Sepolia (84532)\nPulseToken: 0x7f24...\nRegistry: 0x2C80...",
          action: GET_CONFIG_ACTION,
        },
      },
    ],
  ] as ActionExample[][],

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() ?? "";
    return /\b(config|settings|contracts|addresses|network)\b/.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<void> => {
    try {
      const apiUrl = runtime.getSetting("AGENT_PULSE_API_URL") ?? "https://api.agentpulse.io";
      
      const response = await fetch(`${apiUrl}/api/config`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Config API error: ${response.status}`);
      }

      const config = await response.json() as ProtocolConfig;

      const message_text =
        `**Protocol Configuration**\n\n` +
        `**Network:** ${config.network.name} (Chain ID: ${config.network.chainId})\n\n` +
        `**Contracts:**\n` +
        `• PulseToken: \`${config.contracts.pulseToken}\`\n` +
        `• PulseRegistry: \`${config.contracts.pulseRegistry}\`\n\n` +
        `**Parameters:**\n` +
        `• TTL: ${config.params.ttlSeconds / 3600} hours\n` +
        `• Min Pulse: ${BigInt(config.params.minPulseAmount) / BigInt(1e18)} PULSE\n\n` +
        `**x402:** ${config.x402.enabled ? "✅ Enabled" : "❌ Disabled"}`;

      const newState = {
        ...state,
        protocolConfig: config,
      };

      if (callback) {
        await callback({
          text: message_text,
          ...newState,
        });
      }

    } catch (error) {
      elizaLogger.error("Error getting protocol config:", String(error));
      if (callback) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await callback({
          text: `❌ Failed to get config: ${errorMessage}`,
        });
      }
    }
  },
};

/**
 * Get protocol health action
 * 
 * Retrieves protocol health status including paused state,
 * total agents, and service health indicators.
 */
export const getHealthAction: Action = {
  name: GET_HEALTH_ACTION,

  description:
    "Get the Agent Pulse protocol health status including paused state, total registered agents, and service health indicators.",

  similes: [
    "HEALTH_CHECK",
    "PROTOCOL_HEALTH",
    "SYSTEM_STATUS",
    "IS_PAUSED",
    "CHECK_HEALTH",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Check protocol health" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Protocol Health: ✅ Healthy\nTotal Agents: 1,234\nStatus: Active",
          action: GET_HEALTH_ACTION,
        },
      },
    ],
  ] as ActionExample[][],

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory
  ): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() ?? "";
    return /\b(health|protocol.*status|system|paused|total agents)\b/.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<void> => {
    try {
      const apiUrl = runtime.getSetting("AGENT_PULSE_API_URL") ?? "https://api.agentpulse.io";
      
      const response = await fetch(`${apiUrl}/api/protocol-health`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Health API error: ${response.status}`);
      }

      const health = await response.json() as ProtocolHealth;

      const healthEmoji = health.health === "healthy" ? "✅" : 
                         health.health === "degraded" ? "⚠️" : "❌";
      const pausedEmoji = health.paused ? "🔴 PAUSED" : "🟢 Active";

      let message_text =
        `**Protocol Health**\n\n` +
        `${healthEmoji} **Status:** ${health.health.toUpperCase()}\n` +
        `**State:** ${pausedEmoji}\n` +
        `**Total Agents:** ${health.totalAgents.toLocaleString()}`;

      if (health.kvHealthy !== undefined) {
        message_text += `\n• KV Store: ${health.kvHealthy ? "✅" : "❌"}`;
      }
      if (health.rpcHealthy !== undefined) {
        message_text += `\n• RPC: ${health.rpcHealthy ? "✅" : "❌"}`;
      }

      const newState = {
        ...state,
        protocolHealth: health,
      };

      if (callback) {
        await callback({
          text: message_text,
          ...newState,
        });
      }

    } catch (error) {
      elizaLogger.error("Error getting protocol health:", String(error));
      if (callback) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await callback({
          text: `❌ Failed to get health: ${errorMessage}`,
        });
      }
    }
  },
};

/**
 * Format time since a timestamp into human readable string
 */
function formatTimeSince(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default getStatusAction;