/**
 * Get Reliability Action
 *
 * Action to retrieve agent reliability metrics from Agent Pulse API v2.
 *
 * @module actions/getReliability
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
import type { ReliabilityMetrics } from "../types";
import { isValidAddress } from "../environment";

/**
 * Action name for getReliability
 */
export const GET_RELIABILITY_ACTION = "GET_RELIABILITY";

/**
 * Get reliability action
 *
 * Retrieves comprehensive reliability metrics for an agent from the v2 API.
 * Requires x402 payment.
 */
const getReliabilityAction: Action = {
  name: GET_RELIABILITY_ACTION,

  description:
    "Get agent reliability metrics from Agent Pulse API v2. Returns reliability score, uptime percentage, jitter, and hazard rate. Requires x402 payment ($0.01 USDC).",

  similes: [
    "CHECK_RELIABILITY",
    "GET_RELIABILITY_SCORE",
    "AGENT_RELIABILITY",
    "RELIABILITY_METRICS",
    "UPTIME_CHECK",
    "JITTER_CHECK",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Check reliability of my agent" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Agent reliability: 92.3%\nUptime: 99.1%\nJitter: 0.08\nHazard Rate: 0.02",
          action: GET_RELIABILITY_ACTION,
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "How reliable is 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Reliability Score: 85.5/100\nUptime: 98.2%\nJitter: 0.15 (moderate variance)",
          action: GET_RELIABILITY_ACTION,
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

    // Check for reliability-related keywords
    const hasReliabilityKeyword =
      /\b(reliability|reliable|uptime|jitter|hazard.rate|metrics)\b/.test(text);

    // Check for ethereum address
    const hasAddress = /0x[a-fA-F0-9]{40}/.test(text);

    return hasReliabilityKeyword || hasAddress;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<void> => {
    elizaLogger.info("GET_RELIABILITY action triggered");

    try {
      const apiUrl = runtime.getSetting("AGENT_PULSE_API_URL") ?? "https://api.agentpulse.io";
      const x402Payment = runtime.getSetting("AGENT_PULSE_X402_PAYMENT_HEADER");

      // Parse address from message or options
      const text = message.content.text ?? "";
      const addressMatch = text.match(/(0x[a-fA-F0-9]{40})/i);
      const address = (options?.address as string) ?? addressMatch?.[1];

      if (!address || !isValidAddress(address)) {
        if (callback) {
          await callback({
            text: "Please provide a valid agent Ethereum address (0x...) to check reliability.",
          });
        }
        return;
      }

      // Check for x402 payment header
      if (!x402Payment) {
        if (callback) {
          await callback({
            text: "❌ x402 payment header required. Please set AGENT_PULSE_X402_PAYMENT_HEADER.",
          });
        }
        return;
      }

      elizaLogger.info(`Fetching reliability for ${address}`);

      // Fetch reliability metrics from v2 API
      const response = await fetch(`${apiUrl}/api/v2/agent/${address}/reliability`, {
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
        if (response.status === 404) {
          if (callback) {
            await callback({
              text: `Agent ${address} not found. This address has never sent a pulse.`,
            });
          }
          return;
        }
        throw new Error(`Reliability API error: ${response.status}`);
      }

      const metrics = await response.json() as ReliabilityMetrics;

      // Format reliability message
      const reliabilityEmoji = metrics.reliabilityScore >= 90 ? "🟢" :
                               metrics.reliabilityScore >= 70 ? "🟡" : "🔴";
      const jitterEmoji = metrics.jitter < 0.1 ? "✅" :
                          metrics.jitter < 0.3 ? "⚠️" : "🔴";

      const message_text =
        `**Reliability Metrics: ${address.slice(0, 6)}...${address.slice(-4)}**\n\n` +
        `${reliabilityEmoji} **Reliability Score:** ${metrics.reliabilityScore.toFixed(1)}/100\n` +
        `📈 **Uptime:** ${metrics.uptimePercent.toFixed(1)}%\n` +
        `${jitterEmoji} **Jitter:** ${metrics.jitter.toFixed(3)} (pulse interval variance)\n` +
        `⚡ **Hazard Rate:** ${(metrics.hazardRate * 100).toFixed(1)}% (failure probability)\n` +
        `🕐 **Last Updated:** ${new Date(metrics.lastUpdated).toLocaleString()}`;

      // Update state
      const newState = {
        ...state,
        reliabilityMetrics: metrics,
      };

      if (callback) {
        await callback({
          text: message_text,
          ...newState,
        });
      }

      elizaLogger.info(`Reliability retrieved for ${address}: ${metrics.reliabilityScore}`);

    } catch (error) {
      elizaLogger.error("Error getting reliability:", String(error));

      if (callback) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await callback({
          text: `❌ Failed to get reliability: ${errorMessage}`,
        });
      }
    }
  },
};

export default getReliabilityAction;
