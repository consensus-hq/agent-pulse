/**
 * Get Global Stats Action
 *
 * Action to retrieve global network statistics from Agent Pulse API v2.
 *
 * @module actions/getGlobalStats
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
import type { GlobalStats } from "../types";

/**
 * Action name for getGlobalStats
 */
export const GET_GLOBAL_STATS_ACTION = "GET_GLOBAL_STATS";

/**
 * Get global stats action
 *
 * Retrieves network-wide aggregate statistics from the v2 API.
 * Requires x402 payment.
 */
const getGlobalStatsAction: Action = {
  name: GET_GLOBAL_STATS_ACTION,

  description:
    "Get global network statistics from Agent Pulse API v2. Returns total active agents, average streak, network signal rate, and overall network health. Requires x402 payment ($0.03 USDC).",

  similes: [
    "NETWORK_STATS",
    "GLOBAL_STATS",
    "NETWORK_HEALTH",
    "AGENT_NETWORK",
    "PULSE_NETWORK",
    "NETWORK_OVERVIEW",
    "ECOSYSTEM_STATS",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Show network stats" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Network Statistics:\nActive Agents: 1,500\nAverage Streak: 30.5 days\nNetwork Health: ✅ Healthy",
          action: GET_GLOBAL_STATS_ACTION,
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "How healthy is the Agent Pulse network?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Agent Pulse Network:\n🟢 Healthy\n📊 1,500 active agents\n🔥 Average streak: 30.5 days\n📡 Signal rate: 1,000 PULSE/day",
          action: GET_GLOBAL_STATS_ACTION,
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

    // Check for network/global stats keywords
    return /\b(network|global|ecosystem).*(stats|statistics|health|overview)|\b(total.agents|active.agents|network.health)\b/.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state: State | undefined,
    _options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<void> => {
    elizaLogger.info("GET_GLOBAL_STATS action triggered");

    try {
      const apiUrl = runtime.getSetting("AGENT_PULSE_API_URL") ?? "https://api.agentpulse.io";
      const x402Payment = runtime.getSetting("AGENT_PULSE_X402_PAYMENT_HEADER");

      // Check for x402 payment header
      if (!x402Payment) {
        if (callback) {
          await callback({
            text: "❌ x402 payment header required. Please set AGENT_PULSE_X402_PAYMENT_HEADER.",
          });
        }
        return;
      }

      elizaLogger.info("Fetching global network stats");

      // Fetch global stats from v2 API
      const response = await fetch(`${apiUrl}/api/v2/network/global-stats`, {
        headers: {
          Accept: "application/json",
          "X-Payment": String(x402Payment),
        },
      });

      if (!response.ok) {
        if (response.status === 402) {
          if (callback) {
            await callback({
              text: "❌ Payment required. Please authenticate to access v2 analytics.",
            });
          }
          return;
        }
        throw new Error(`Global stats API error: ${response.status}`);
      }

      const stats = await response.json() as GlobalStats;

      // Format global stats message
      const healthEmoji = stats.networkHealth === "healthy" ? "🟢" :
                          stats.networkHealth === "degraded" ? "🟡" : "🔴";
      const reliabilityEmoji = stats.averageReliability >= 80 ? "🟢" :
                               stats.averageReliability >= 50 ? "🟡" : "🔴";

      const message_text =
        `**Agent Pulse Network Statistics**\n\n` +
        `${healthEmoji} **Network Health:** ${stats.networkHealth.toUpperCase()}\n` +
        `👥 **Active Agents:** ${stats.totalActiveAgents.toLocaleString()}\n` +
        `🔥 **Average Streak:** ${stats.averageStreak.toFixed(1)} days\n` +
        `${reliabilityEmoji} **Average Reliability:** ${stats.averageReliability.toFixed(1)}%\n` +
        `📡 **Signal Rate:** ${stats.networkSignalRate.toFixed(1)} PULSE/day`;

      // Update state
      const newState = {
        ...state,
        globalStats: stats,
      };

      if (callback) {
        await callback({
          text: message_text,
          ...newState,
        });
      }

      elizaLogger.info(`Global stats retrieved: ${stats.totalActiveAgents} agents`);

    } catch (error) {
      elizaLogger.error("Error getting global stats:", String(error));

      if (callback) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await callback({
          text: `❌ Failed to get global stats: ${errorMessage}`,
        });
      }
    }
  },
};

export default getGlobalStatsAction;
