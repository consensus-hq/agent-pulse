/**
 * Pulse State Provider
 * 
 * Provider that exposes Agent Pulse protocol state to the agent runtime.
 * Provides current agent status, protocol config, and health information.
 * 
 * @module providers/pulseState
 */

import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
  elizaLogger,
} from "@elizaos/core";
import type { AgentStatus, ProtocolConfig, ProtocolHealth } from "../types";

/**
 * Provider name
 */
export const PULSE_STATE_PROVIDER = "PULSE_STATE";

/**
 * Pulse state provider
 * 
 * Provides current state information about the Agent Pulse protocol
 * including agent status, configuration, and health metrics.
 */
const pulseStateProvider: Provider = {
  name: PULSE_STATE_PROVIDER,
  description: 
    "Provides current state from the Agent Pulse protocol including agent liveness status, " +
    "protocol configuration, and health metrics.",

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state: State
  ): Promise<ProviderResult> => {
    try {
      const apiUrl = runtime.getSetting("AGENT_PULSE_API_URL") ?? "https://api.agentpulse.io";
      const agentAddress = runtime.getSetting("AGENT_ADDRESS") as `0x${string}` | undefined;

      const sections: string[] = [];

      // Get protocol health
      try {
        const healthResponse = await fetch(`${apiUrl}/api/protocol-health`, {
          headers: { Accept: "application/json" },
        });
        
        if (healthResponse.ok) {
          const health = await healthResponse.json() as ProtocolHealth;
          const statusEmoji = health.health === "healthy" ? "✅" : 
                             health.health === "degraded" ? "⚠️" : "❌";
          
          sections.push(
            `Protocol: ${statusEmoji} ${health.health.toUpperCase()}` +
            `${health.paused ? " (PAUSED)" : ""}` +
            ` | ${health.totalAgents.toLocaleString()} agents`
          );
        }
      } catch (e) {
        elizaLogger.warn("Failed to fetch protocol health:", String(e));
      }

      // Get agent status if address is configured
      if (agentAddress) {
        try {
          const statusResponse = await fetch(`${apiUrl}/api/status/${agentAddress}`, {
            headers: { Accept: "application/json" },
          });
          
          if (statusResponse.ok) {
            const status = await statusResponse.json() as AgentStatus;
            const aliveEmoji = status.alive ? "🟢" : "🔴";
            const timeSince = formatTimeSince(status.lastPulse);
            
            sections.push(
              `Agent: ${aliveEmoji} ${status.alive ? "Alive" : "Dead"}` +
              ` | Streak: 🔥 ${status.streak}` +
              ` | Last pulse: ${timeSince} ago`
            );

            // Update state if provided
            if (state) {
              (state as Record<string, unknown>).agentStatus = status;
            }
          }
        } catch (e) {
          elizaLogger.warn("Failed to fetch agent status:", String(e));
        }
      }

      // Get protocol config (for TTL info)
      try {
        const configResponse = await fetch(`${apiUrl}/api/config`, {
          headers: { Accept: "application/json" },
        });
        
        if (configResponse.ok) {
          const config = await configResponse.json() as ProtocolConfig;
          const ttlHours = config.params.ttlSeconds / 3600;
          const minPulse = formatAmount(config.params.minPulseAmount);
          
          sections.push(`TTL: ${ttlHours}h | Min pulse: ${minPulse} PULSE`);

          if (state) {
            (state as Record<string, unknown>).protocolConfig = config;
          }
        }
      } catch (e) {
        elizaLogger.warn("Failed to fetch protocol config:", String(e));
      }

      const text = sections.length > 0 
        ? `Agent Pulse Protocol:\n${sections.join("\n")}` 
        : null;

      return { text: text ?? undefined };

    } catch (error) {
      elizaLogger.error("Error in pulseStateProvider:", String(error));
      return { text: undefined };
    }
  },
};

/**
 * Format time since a timestamp
 */
function formatTimeSince(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * Format wei amount to human readable
 */
function formatAmount(wei: string): string {
  const pulse = Number(BigInt(wei)) / 1e18;
  return pulse % 1 === 0 ? pulse.toString() : pulse.toFixed(4);
}

/**
 * Create a provider that tracks a specific agent's status
 */
export function createAgentStatusProvider(
  agentAddress: `0x${string}`
): Provider {
  return {
    name: `AGENT_STATUS_${agentAddress.slice(-6)}`,
    description: `Provider for agent ${agentAddress} status`,
    
    get: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State
    ): Promise<ProviderResult> => {
      try {
        const apiUrl = runtime.getSetting("AGENT_PULSE_API_URL") ?? "https://api.agentpulse.io";
        
        const response = await fetch(`${apiUrl}/api/status/${agentAddress}`, {
          headers: { Accept: "application/json" },
        });
        
        if (!response.ok) {
          return { 
            text: `Agent ${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}: Not found` 
          };
        }

        const status = await response.json() as AgentStatus;
        const aliveEmoji = status.alive ? "🟢" : "🔴";
        const timeSince = formatTimeSince(status.lastPulse);
        
        return { 
          text: `${aliveEmoji} ${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}: ` +
               `${status.alive ? "Alive" : "Dead"} | 🔥 ${status.streak} | ${timeSince} ago` 
        };

      } catch (error) {
        elizaLogger.error(`Error fetching status for ${agentAddress}:`, String(error));
        return { text: undefined };
      }
    },
  };
}

export default pulseStateProvider;
