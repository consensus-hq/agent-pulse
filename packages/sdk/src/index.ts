/**
 * Agent Pulse SDK
 * 
 * TypeScript SDK for the Agent Pulse protocol - on-chain liveness signaling for autonomous agents.
 * 
 * @packageDocumentation
 * @module index
 * @see https://agent-pulse-nine.vercel.app
 * 
 * @example
 * ```typescript
 * import { AgentPulse } from "@agent-pulse/sdk";
 * 
 * // One-Line Pulse™
 * const pulse = new AgentPulse({
 *   wallet: { address: "0x...", privateKey: "0x..." }
 * });
 * await pulse.beat(); // 💓
 * ```
 */

import {
  type Address,
} from "viem";

import {
  type SDKConfig,
  type WalletConfig,
  type AgentPulseClientConfig,
  type AgentStatus,
  type ProtocolConfig,
  type ProtocolHealth,
  type PulseParams,
  type PulseResponse,
  type ReliabilityScore,
  type LivenessProof,
  type GlobalStats,
  type PeerCorrelation,
  type TransferAuthorization,
  AgentPulseError,
  DEFAULTS,
  ENDPOINT_PRICES,
  USDC_ADDRESSES,
  DEAD_ADDRESS,
} from "./types.js";

import {
  AgentPulseClient,
} from "./client.js";

import {
  AgentPulseGate,
  type GateMode,
  type GateOptions,
  type GateStatus,
  type PulseRequiredError,
} from "./gate.js";

import {
  X402PaymentHandler,
  type CreateAuthorizationParams,
  createTransferAuthorization,
  signX402Payment,
  encodeX402PaymentHeader,
  decodeX402PaymentHeader,
  priceToMicroUsdc,
  microUsdcToPrice,
  generateNonce,
} from "./x402.js";

// ============================================================================
// AgentPulse Main Class
// ============================================================================

/**
 * Agent Pulse SDK - Main Class
 * 
 * Simplified interface for the most common use cases.
 * For advanced usage, use {@link AgentPulseClient} directly.
 * 
 * @example
 * ```typescript
 * import { AgentPulse } from "@agent-pulse/sdk";
 * 
 * const pulse = new AgentPulse({
 *   wallet: {
 *     address: "0xYourAgentAddress",
 *     privateKey: "0xYourPrivateKey", // Optional, required for transactions
 *   },
 * });
 * 
 * // One-Line Pulse™ - send a heartbeat
 * await pulse.beat();
 * 
 * // Check if alive (free)
 * const alive = await pulse.isAlive("0x...");
 * 
 * // Get reliability (paid API)
 * const reliability = await pulse.getReliability("0x...");
 * ```
 */
export class AgentPulse {
  private client: AgentPulseClient;

  /**
   * Create a new AgentPulse instance
   * @param config - SDK configuration
   */
  constructor(config: AgentPulseClientConfig = {}) {
    this.client = new AgentPulseClient(config);
  }

  /**
   * The One-Line Pulse™
   * 
   * Send a pulse to prove your agent is alive.
   * Burns 1 PULSE token and updates your streak.
   * 
   * @returns Pulse response with transaction hash and new streak
   * @example
   * ```typescript
   * const pulse = new AgentPulse({ wallet });
   * const { txHash, streak } = await pulse.beat();
   * console.log(`💓 Pulse sent! Streak: ${streak}`);
   * ```
   */
  async beat(): Promise<PulseResponse> {
    return this.client.pulse({ amount: DEFAULTS.DEFAULT_PULSE_AMOUNT });
  }

  /**
   * Send a pulse with custom amount
   * @param amount - Amount in wei (default: 1e18 = 1 PULSE)
   */
  async pulse(amount?: bigint | string): Promise<PulseResponse> {
    return this.client.pulse({ amount });
  }

  /**
   * Check if an agent is alive (free on-chain read)
   * @param address - Agent address to check
   */
  async isAlive(address: Address): Promise<boolean> {
    return this.client.isAlive(address);
  }

  /**
   * Get full agent status (free on-chain read)
   * @param address - Agent address
   */
  async getStatus(address: Address): Promise<AgentStatus> {
    return this.client.getAgentStatus(address);
  }

  /**
   * Get reliability score (paid API - $0.01)
   * @param address - Agent address
   */
  async getReliability(address: Address): Promise<ReliabilityScore> {
    return this.client.getReliability(address);
  }

  /**
   * Get liveness proof (paid API - $0.005)
   * @param address - Agent address
   */
  async getLivenessProof(address: Address): Promise<LivenessProof> {
    return this.client.getLivenessProof(address);
  }

  /**
   * Get global stats (paid API - $0.03)
   */
  async getGlobalStats(): Promise<GlobalStats> {
    return this.client.getGlobalStats();
  }

  /**
   * Get peer correlation (paid API - $0.02)
   * @param address - Agent address
   */
  async getPeerCorrelation(address: Address): Promise<PeerCorrelation> {
    return this.client.getPeerCorrelation(address);
  }

  /**
   * Get protocol configuration (free)
   */
  async getConfig(): Promise<ProtocolConfig> {
    return this.client.getProtocolConfig();
  }

  /**
   * Get protocol health (free)
   */
  async getHealth(): Promise<ProtocolHealth> {
    return this.client.getProtocolHealth();
  }

  /**
   * Get PULSE token balance
   * @param address - Address to check (defaults to wallet address)
   */
  async getBalance(address?: Address): Promise<bigint> {
    return this.client.getBalance(address);
  }

  /**
   * Get the underlying client for advanced usage
   */
  getClient(): AgentPulseClient {
    return this.client;
  }

  /**
   * Create a gate for this agent
   * @param options - Gating options
   */
  createGate(options: GateOptions = {}): AgentPulseGate {
    return new AgentPulseGate(this.client, options);
  }
}

// ============================================================================
// Exports
// ============================================================================

// Main classes
export { AgentPulseClient, X402PaymentHandler, AgentPulseGate };

// Types
export type {
  SDKConfig,
  WalletConfig,
  AgentPulseClientConfig,
  AgentStatus,
  ProtocolConfig,
  ProtocolHealth,
  PulseParams,
  PulseResponse,
  ReliabilityScore,
  LivenessProof,
  GlobalStats,
  PeerCorrelation,
  TransferAuthorization,
  CreateAuthorizationParams,
  GateMode,
  GateOptions,
  GateStatus,
  PulseRequiredError,
};

// Constants
export { DEFAULTS, ENDPOINT_PRICES, USDC_ADDRESSES, DEAD_ADDRESS };

// x402 utilities
export {
  createTransferAuthorization,
  signX402Payment,
  encodeX402PaymentHeader,
  decodeX402PaymentHeader,
  priceToMicroUsdc,
  microUsdcToPrice,
  generateNonce,
};

// Error class
export { AgentPulseError };

// Default export
export default AgentPulse;
