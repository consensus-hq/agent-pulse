/**
 * Get Liveness Proof Action
 *
 * Action to retrieve a cryptographically signed proof of agent liveness
 * from Agent Pulse API v2.
 *
 * @module actions/getLivenessProof
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
import type { LivenessProof } from "../types";
import { isValidAddress } from "../environment";

/**
 * Action name for getLivenessProof
 */
export const GET_LIVENESS_PROOF_ACTION = "GET_LIVENESS_PROOF";

/**
 * Get liveness proof action
 *
 * Generates a cryptographically signed proof of agent liveness.
 * The proofToken can be verified off-chain.
 * Requires x402 payment.
 */
const getLivenessProofAction: Action = {
  name: GET_LIVENESS_PROOF_ACTION,

  description:
    "Get a cryptographically signed proof of agent liveness from Agent Pulse API v2. Returns a proofToken that can be verified off-chain. Requires x402 payment ($0.005 USDC).",

  similes: [
    "GET_PROOF",
    "LIVENESS_PROOF",
    "PROOF_OF_LIFE",
    "VERIFY_ALIVE",
    "SIGNED_PROOF",
    "GET_PROOF_TOKEN",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Get liveness proof for my agent" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Liveness proof generated:\nStatus: ✅ Alive\nLast pulse: 5 min ago\nProof token: eyJhbG... (truncated)",
          action: GET_LIVENESS_PROOF_ACTION,
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Generate proof that 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb is alive" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Proof generated for 0x742d...0bEb:\n✅ Agent is alive\nStaleness: 2h 15m\nProof token available",
          action: GET_LIVENESS_PROOF_ACTION,
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

    // Check for proof-related keywords
    const hasProofKeyword =
      /\b(proof|proof.of.life|liveness.proof|verify.*alive|signed.proof|proof.token)\b/.test(text);

    // Check for ethereum address
    const hasAddress = /0x[a-fA-F0-9]{40}/.test(text);

    return hasProofKeyword || hasAddress;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<void> => {
    elizaLogger.info("GET_LIVENESS_PROOF action triggered");

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
            text: "Please provide a valid agent Ethereum address (0x...) to get liveness proof.",
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

      elizaLogger.info(`Fetching liveness proof for ${address}`);

      // Fetch liveness proof from v2 API
      const response = await fetch(`${apiUrl}/api/v2/agent/${address}/liveness-proof`, {
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
        throw new Error(`Liveness proof API error: ${response.status}`);
      }

      const proof = await response.json() as LivenessProof;

      // Format proof message
      const statusEmoji = proof.isAlive ? "🟢" : "🔴";
      const statusText = proof.isAlive ? "Alive" : "Not Alive";
      const stalenessHours = Math.floor(proof.staleness / 3600);
      const stalenessMins = Math.floor((proof.staleness % 3600) / 60);

      const message_text =
        `**Liveness Proof: ${address.slice(0, 6)}...${address.slice(-4)}**\n\n` +
        `${statusEmoji} **Status:** ${statusText}\n` +
        `🕐 **Last Pulse:** ${new Date(proof.lastPulse).toLocaleString()}\n` +
        `⏱️ **Staleness:** ${stalenessHours}h ${stalenessMins}m since last pulse\n\n` +
        `🔐 **Proof Token:**\n` +
        `\`${proof.proofToken.slice(0, 32)}...${proof.proofToken.slice(-8)}\`\n\n` +
        `This proof can be verified off-chain without querying the API.`;

      // Update state
      const newState = {
        ...state,
        livenessProof: proof,
      };

      if (callback) {
        await callback({
          text: message_text,
          ...newState,
        });
      }

      elizaLogger.info(`Liveness proof retrieved for ${address}: alive=${proof.isAlive}`);

    } catch (error) {
      elizaLogger.error("Error getting liveness proof:", String(error));

      if (callback) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await callback({
          text: `❌ Failed to get liveness proof: ${errorMessage}`,
        });
      }
    }
  },
};

export default getLivenessProofAction;
