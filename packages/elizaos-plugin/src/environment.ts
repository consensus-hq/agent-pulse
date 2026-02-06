/**
 * Environment Configuration
 * 
 * Zod schema for validating Agent Pulse plugin configuration.
 * @module environment
 */

import { z } from "zod";

/**
 * Environment schema for Agent Pulse plugin
 * All values can be set via environment variables or runtime config
 */
export const agentPulseEnvSchema = z.object({
  /** Base Sepolia RPC URL */
  AGENT_PULSE_RPC_URL: z
    .string()
    .url()
    .default("https://sepolia.base.org"),

  /** Agent Pulse API base URL */
  AGENT_PULSE_API_URL: z
    .string()
    .url()
    .default("https://api.agentpulse.io"),

  /** PulseToken contract address (Base Sepolia) */
  AGENT_PULSE_TOKEN_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default("0x21111B39A502335aC7e45c4574Dd083A69258b07"),

  /** PulseRegistry contract address (Base Sepolia) */
  AGENT_PULSE_REGISTRY_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default("0xe61C615743A02983A46aFF66Db035297e8a43846"),

  /** Default pulse amount in wei (1 PULSE = 1e18) */
  AGENT_PULSE_DEFAULT_AMOUNT: z
    .string()
    .regex(/^\d+$/)
    .default("1000000000000000000"),

  /** Chain ID for Base Sepolia */
  AGENT_PULSE_CHAIN_ID: z
    .string()
    .default("84532"),

  /** Private key for signing transactions (optional - can use external wallet) */
  AGENT_PULSE_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),

  /** x402 facilitator URL (optional) */
  AGENT_PULSE_X402_FACILITATOR: z
    .string()
    .url()
    .optional(),

  /** Whether to enable x402 payments */
  AGENT_PULSE_X402_ENABLED: z
    .enum(["true", "false"])
    .default("true"),

  /** Request timeout in milliseconds */
  AGENT_PULSE_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/)
    .default("30000"),

  /** x402 payment header for v2 API calls (optional - required for analytics) */
  AGENT_PULSE_X402_PAYMENT_HEADER: z
    .string()
    .optional(),
});

/**
 * Type for parsed environment configuration
 */
export type AgentPulseConfig = z.infer<typeof agentPulseEnvSchema>;

/**
 * Validate and parse environment configuration
 */
export function validateConfig(
  runtimeConfig: Record<string, string | undefined>
): AgentPulseConfig {
  return agentPulseEnvSchema.parse(runtimeConfig);
}

/**
 * Check if a value is a valid EVM address
 */
export function isValidAddress(address: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}