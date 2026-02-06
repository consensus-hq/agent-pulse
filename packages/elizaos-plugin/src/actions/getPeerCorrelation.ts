/**
 * Get Peer Correlation Action
 *
 * Action to retrieve peer correlation analysis from Agent Pulse API v2.
 *
 * @module actions/getPeerCorrelation
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
import type { PeerCorrelation } from "../types";
import { isValidAddress } from "../environment";

/**
 * Action name for getPeerCorrelation
 */
export const GET_PEER_CORRELATION_ACTION = "GET_PEER_CORRELATION";

/**
 * Get peer correlation action
 *
 * Finds agents with correlated liveness patterns.
 * Useful for swarm coordinators to group agents for redundant task assignment.
 * Requires x402 payment.
 */
const getPeerCorrelationAction: Action = {
  name: GET_PEER_CORRELATION_ACTION,

  description:
    "Get peer correlation analysis from Agent Pulse API v2. Finds agents with correlated liveness patterns for swarm coordination. Requires x402 payment ($0.02 USDC).",

  similes: [
    "PEER_CORRELATION",
    "FIND_PEERS",
    "SIMILAR_AGENTS",
    "CORRELATION_ANALYSIS",
    "AGENT_CLUSTER",
    "SWARM_COORDINATION",
    "PEER_GROUP",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Find agents similar to mine" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Peer Analysis:\nCorrelation: 0.78\nSimilar agents: 2 found\nCluster: copywriters-west",
          action: GET_PEER_CORRELATION_ACTION,
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Get peer correlation for 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Peer Correlation for 0x742d...0bEb:\n📊 Correlation: 0.78 (high)\n👥 Similar: 0xabc..., 0xdef...\n🏷️ Cluster: copywriters-west",
          action: GET_PEER_CORRELATION_ACTION,
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

    // Check for peer/correlation keywords
    const hasPeerKeyword =
      /\b(peer|correlation|similar|cluster|swarm|peers|related.agents)\b/.test(text);

    // Check for ethereum address
    const hasAddress = /0x[a-fA-F0-9]{40}/.test(text);

    return hasPeerKeyword || hasAddress;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<void> => {
    elizaLogger.info("GET_PEER_CORRELATION action triggered");

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
            text: "Please provide a valid agent Ethereum address (0x...) to check peer correlation.",
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

      elizaLogger.info(`Fetching peer correlation for ${address}`);

      // Fetch peer correlation from v2 API
      const response = await fetch(`${apiUrl}/api/v2/network/peer-correlation/${address}`, {
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
        throw new Error(`Peer correlation API error: ${response.status}`);
      }

      const correlation = await response.json() as PeerCorrelation;

      // Format correlation message
      const correlationLevel = correlation.peerCorrelation >= 0.7 ? "high" :
                               correlation.peerCorrelation >= 0.4 ? "moderate" : "low";
      const correlationEmoji = correlation.peerCorrelation >= 0.7 ? "🟢" :
                               correlation.peerCorrelation >= 0.4 ? "🟡" : "🔴";

      let similarAgentsText = "None found";
      if (correlation.similarAgents.length > 0) {
        similarAgentsText = correlation.similarAgents
          .map(a => `${a.slice(0, 6)}...${a.slice(-4)}`)
          .join(", ");
      }

      const message_text =
        `**Peer Correlation: ${address.slice(0, 6)}...${address.slice(-4)}**\n\n` +
        `${correlationEmoji} **Correlation Score:** ${correlation.peerCorrelation.toFixed(2)} (${correlationLevel})\n` +
        `👥 **Similar Agents:** ${similarAgentsText}\n` +
        `🏷️ **Cluster ID:** ${correlation.clusterId}\n\n` +
        `Agents in the same cluster have correlated liveness patterns, useful for ` +
        `redundant task assignment in swarm coordination.`;

      // Update state
      const newState = {
        ...state,
        peerCorrelation: correlation,
      };

      if (callback) {
        await callback({
          text: message_text,
          ...newState,
        });
      }

      elizaLogger.info(`Peer correlation retrieved for ${address}: ${correlation.peerCorrelation}`);

    } catch (error) {
      elizaLogger.error("Error getting peer correlation:", String(error));

      if (callback) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await callback({
          text: `❌ Failed to get peer correlation: ${errorMessage}`,
        });
      }
    }
  },
};

export default getPeerCorrelationAction;
