/**
 * Send Pulse Action
 * 
 * Action to send a liveness pulse to the Agent Pulse protocol.
 * Burns PULSE tokens to signal agent is alive.
 * 
 * @module actions/sendPulse
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
import type { PulseResponse, SendPulseParams } from "../types.ts";
import { isValidAddress } from "../environment.ts";

/**
 * Action name for sendPulse
 */
export const SEND_PULSE_ACTION = "SEND_PULSE";

/**
 * Send pulse action implementation
 * 
 * Allows an agent to prove liveness by burning PULSE tokens.
 * Default amount is 1 PULSE (1e18 wei).
 */
const sendPulseAction: Action = {
  name: SEND_PULSE_ACTION,
  
  description: 
    "Send a liveness pulse to the Agent Pulse protocol. Burns PULSE tokens to signal the agent is alive and maintains the pulse streak.",

  similes: [
    "PULSE",
    "HEARTBEAT",
    "SIGNAL_ALIVE",
    "CHECK_IN",
    "STAY_ALIVE",
    "BURN_PULSE",
    "PROVE_LIVENESS",
  ],

  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Send a pulse for my agent" },
      },
      {
        user: "{{agent}}",
        content: {
          text: "Successfully sent pulse. Transaction: 0xabc... Streak: 5",
          action: SEND_PULSE_ACTION,
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Pulse 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb with 2 PULSE" },
      },
      {
        user: "{{agent}}",
        content: {
          text: "Pulse sent successfully. Tx: 0xdef... Streak: 12",
          action: SEND_PULSE_ACTION,
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Keep my agent alive" },
      },
      {
        user: "{{agent}}",
        content: {
          text: "Sending pulse to maintain liveness... Success! Streak: 3",
          action: SEND_PULSE_ACTION,
        },
      },
    ],
  ] as ActionExample[][],

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<boolean> => {
    // Extract potential agent address from message
    const text = message.content.text?.toLowerCase() ?? "";
    
    // Check for pulse-related keywords
    const hasPulseKeyword = 
      /\b(pulse|heartbeat|check.in|stay.alive|signal|burn)\b/.test(text);
    
    // Check for ethereum address pattern
    const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
    
    // Either has pulse keywords or explicit address
    return hasPulseKeyword || !!addressMatch;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined
  ): Promise<void> => {
    elizaLogger.info("SEND_PULSE action triggered");

    try {
      // Parse parameters from message or options
      const params = parsePulseParams(message, options);
      
      if (!isValidAddress(params.agentAddress)) {
        if (callback) {
          await callback({
            text: "Invalid agent address provided. Please provide a valid Ethereum address (0x...).",
          });
        }
        return;
      }

      // Get API configuration from runtime
      const apiUrl = runtime.getSetting("AGENT_PULSE_API_URL") ?? "https://api.agentpulse.io";
      const defaultAmount = runtime.getSetting("AGENT_PULSE_DEFAULT_AMOUNT") ?? "1000000000000000000";
      
      const amount = params.amount ?? defaultAmount;

      elizaLogger.info(`Sending pulse for ${params.agentAddress} with amount ${amount}`);

      // Call the Agent Pulse API (x402 gated)
      const response = await fetch(`${apiUrl}/api/pulse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          agentAddress: params.agentAddress,
          amount,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pulse API error: ${response.status} - ${errorText}`);
      }

      const result: PulseResponse = await response.json();

      // Update state with pulse info
      const newState = {
        ...state,
        lastPulseAt: Date.now(),
        lastPulseTx: result.txHash,
        lastPulseStreak: result.streak,
      };

      if (callback) {
        await callback({
          text: `✅ Pulse sent successfully!\n` +
                `Transaction: ${result.txHash}\n` +
                `Streak: ${result.streak} days`,
          ...newState,
        });
      }

      elizaLogger.info(`Pulse sent: ${result.txHash}, streak: ${result.streak}`);

    } catch (error) {
      elizaLogger.error("Error sending pulse:", error);
      
      if (callback) {
        await callback({
          text: `❌ Failed to send pulse: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  },
};

/**
 * Parse pulse parameters from message and options
 */
function parsePulseParams(
  message: Memory,
  options?: Record<string, unknown>
): SendPulseParams {
  const text = message.content.text ?? "";
  
  // Try to extract address from message
  const addressMatch = text.match(/(0x[a-fA-F0-9]{40})/i);
  
  // Options take precedence, then extracted from message
  const agentAddress = (options?.agentAddress as string) ?? addressMatch?.[1];
  
  // Try to extract amount from message (e.g., "2 PULSE" or "2000000000000000000")
  const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:pulse|wei)/i);
  const amount = options?.amount as string | undefined;
  
  // Convert PULSE to wei if needed
  let finalAmount: string | undefined;
  if (amount) {
    finalAmount = amount;
  } else if (amountMatch) {
    const pulseAmount = parseFloat(amountMatch[1]);
    finalAmount = BigInt(Math.floor(pulseAmount * 1e18)).toString();
  }

  if (!agentAddress) {
    throw new Error("No agent address provided. Please specify an Ethereum address.");
  }

  return {
    agentAddress: agentAddress as `0x${string}`,
    amount: finalAmount,
  };
}

export default sendPulseAction;