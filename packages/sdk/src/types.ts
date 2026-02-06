/**
 * Agent Pulse SDK - Type Definitions
 * 
 * Type definitions for the Agent Pulse protocol.
 * @module types
 */

import type { Address, Hash, Hex } from "viem";

// ============================================================================
// Core Agent Types
// ============================================================================

/**
 * Agent status returned by the protocol
 */
export interface AgentStatus {
  /** Whether the agent is currently alive (within TTL) */
  alive: boolean;
  /** Unix timestamp (seconds) of the last pulse */
  lastPulse: number;
  /** Current pulse streak (consecutive periods) */
  streak: number;
  /** Hazard score 0-100 */
  hazardScore: number;
  /** TTL in seconds before agent is considered dead */
  ttlSeconds: number;
}

/**
 * Raw agent status from PulseRegistry contract
 */
export interface ContractAgentStatus {
  alive: boolean;
  lastPulseAt: bigint;
  streak: bigint;
  hazardScore: bigint;
}

/**
 * Detailed agent info from the contract
 */
export interface AgentInfo {
  /** Unix timestamp of last pulse (seconds) */
  lastPulseAt: bigint;
  /** Current streak count */
  streak: bigint;
  /** Last day streak was recorded (for daily tracking) */
  lastStreakDay: bigint;
  /** Current hazard score (0-255) */
  hazardScore: bigint;
}

// ============================================================================
// Protocol Configuration Types
// ============================================================================

/**
 * Network configuration
 */
export interface NetworkConfig {
  /** Chain ID */
  chainId: number;
  /** Network name */
  name: string;
  /** RPC URL (optional, for direct calls) */
  rpcUrl?: string;
}

/**
 * Protocol configuration returned by /api/config
 */
export interface ProtocolConfig {
  /** Network configuration */
  network: NetworkConfig;
  /** Contract addresses */
  contracts: {
    pulseToken: Address;
    pulseRegistry: Address;
  };
  /** x402 payment configuration */
  x402: {
    enabled: boolean;
    facilitatorUrl?: string;
    resource?: string;
  };
  /** Protocol parameters */
  params: {
    ttlSeconds: number;
    minPulseAmount: string;
  };
}

/**
 * Protocol health status
 */
export interface ProtocolHealth {
  /** Whether the protocol is paused */
  paused: boolean;
  /** Total number of registered agents */
  totalAgents: number;
  /** Overall health status string */
  health: "healthy" | "degraded" | "unhealthy";
  /** Individual service health flags */
  kvHealthy?: boolean;
  rpcHealthy?: boolean;
  status?: string;
}

// ============================================================================
// Pulse Transaction Types
// ============================================================================

/**
 * Parameters for sending a pulse
 */
export interface PulseParams {
  /** Amount to pulse in wei (default: 1e18 = 1 PULSE) */
  amount?: bigint | string;
}

/**
 * Response from successful pulse transaction
 */
export interface PulseResponse {
  success: boolean;
  /** Transaction hash */
  txHash: Hash;
  /** New streak count after pulse */
  streak: number;
}

/**
 * Options for pulse transaction
 */
export interface PulseOptions {
  /** Gas limit override */
  gasLimit?: bigint;
  /** Maximum fee per gas */
  maxFeePerGas?: bigint;
  /** Maximum priority fee per gas */
  maxPriorityFeePerGas?: bigint;
  /** Nonce override */
  nonce?: number;
}

// ============================================================================
// x402 Payment Types
// ============================================================================

/**
 * x402 payment requirements response
 */
export interface X402Requirements {
  required: boolean;
  amount: string;
  token: string;
  recipient: string;
}

/**
 * x402 payment request headers
 */
export interface X402PaymentHeaders {
  /** Payment header name (varies by implementation) */
  "x-payment"?: string;
  "X-Payment"?: string;
  "PAYMENT-SIGNATURE"?: string;
  "payment-signature"?: string;
}

/**
 * USDC transfer authorization parameters (EIP-712)
 */
export interface TransferAuthorization {
  /** Address of the token owner */
  from: Address;
  /** Address of the token spender */
  to: Address;
  /** Amount to transfer */
  value: bigint;
  /** Valid after timestamp */
  validAfter: number;
  /** Valid before timestamp */
  validBefore: number;
  /** Unique nonce */
  nonce: Hex;
  /** EIP-712 signature */
  signature: Hex;
}

/**
 * x402 payment settlement result
 */
export interface PaymentSettlement {
  /** HTTP status */
  status: number;
  /** Payment details (if successful) */
  payment?: {
    payer: Address;
    amount: string;
    timestamp: string;
  };
  /** Error message (if failed) */
  error?: string;
}

// ============================================================================
// Paid API Endpoint Types
// ============================================================================

/**
 * Reliability score for an agent
 */
export interface ReliabilityScore {
  /** Agent address */
  address: Address;
  /** Reliability score (0-100) */
  score: number;
  /** Number of pulses in the evaluation window */
  pulseCount: number;
  /** Average streak length */
  avgStreak: number;
  /** Last updated timestamp */
  lastUpdated: string;
}

/**
 * Liveness proof for verification
 */
export interface LivenessProof {
  /** Agent address */
  address: Address;
  /** Proof that agent is alive */
  isAlive: boolean;
  /** Timestamp of proof generation */
  timestamp: string;
  /** Signature from the proof service */
  signature?: Hex;
  /** Block number at proof time */
  blockNumber?: bigint;
}

/**
 * Global protocol statistics
 */
export interface GlobalStats {
  /** Total number of agents ever registered */
  totalAgents: number;
  /** Number of currently active agents */
  activeAgents: number;
  /** Total pulses sent (all time) */
  totalPulses: bigint;
  /** Total PULSE tokens signaled */
  totalSignaled: bigint;
  /** Average streak across all agents */
  avgStreak: number;
  /** Protocol start timestamp */
  startedAt: string;
}

/**
 * Peer correlation data
 */
export interface PeerCorrelation {
  /** Base agent address */
  address: Address;
  /** Correlated peers */
  peers: Array<{
    /** Peer address */
    address: Address;
    /** Correlation score (0-1) */
    correlation: number;
    /** Reason for correlation */
    reason: string;
  }>;
  /** Cluster ID if agent belongs to a cluster */
  clusterId?: string;
}

// ============================================================================
// SDK Configuration Types
// ============================================================================

/**
 * SDK configuration options
 */
export interface SDKConfig {
  /** Base URL for the Agent Pulse API */
  baseUrl?: string;
  /** Chain ID (default: 84532 for Base Sepolia) */
  chainId?: number;
  /** RPC URL for direct contract calls */
  rpcUrl?: string;
  /** Contract addresses (optional, will use defaults) */
  contracts?: {
    pulseToken?: Address;
    pulseRegistry?: Address;
  };
  /** x402 facilitator configuration */
  x402?: {
    /** Facilitator URL for payment settlement */
    facilitatorUrl?: string;
    /** Server wallet address to pay to */
    serverWalletAddress?: Address;
  };
}

/**
 * Wallet/account configuration for transactions
 */
export interface WalletConfig {
  /** Account address */
  address: Address;
  /** Sign function for transactions */
  signMessage?: (message: string | Hex) => Promise<Hex>;
  /** Sign typed data function for EIP-712 */
  signTypedData?: <T extends Record<string, unknown>>(
    domain: TypedDataDomain,
    types: T,
    message: Record<string, unknown>
  ) => Promise<Hex>;
  /** Optional private key (for direct signing) */
  privateKey?: Hex;
}

/**
 * EIP-712 typed data domain
 */
export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: Address;
  salt?: Hex;
}

/**
 * Client options for API requests
 */
export interface ClientOptions {
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Additional headers */
  headers?: Record<string, string>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * SDK error codes
 */
export type SDKErrorCode =
  | "PAYMENT_REQUIRED"
  | "INVALID_ADDRESS"
  | "INSUFFICIENT_BALANCE"
  | "TRANSACTION_FAILED"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "NOT_IMPLEMENTED"
  | "UNKNOWN";

/**
 * SDK error
 */
export class AgentPulseError extends Error {
  constructor(
    message: string,
    public readonly code: SDKErrorCode,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AgentPulseError";
  }
}

// ============================================================================
// Constants
// ============================================================================

/** Default configuration values */
export const DEFAULTS = {
  BASE_URL: "https://agent-pulse-nine.vercel.app",
  CHAIN_ID: 84532, // Base Sepolia
  PULSE_TOKEN: "0x7f24C286872c9594499CD634c7Cc7735551242a2" as Address,
  PULSE_REGISTRY: "0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612" as Address,
  MIN_PULSE_AMOUNT: 1000000000000000000n, // 1 PULSE
  DEFAULT_PULSE_AMOUNT: 1000000000000000000n, // 1 PULSE
  TTL_SECONDS: 86400, // 24 hours
  TIMEOUT_MS: 30000,
} as const;

/** USDC contract addresses */
export const USDC_ADDRESSES: Record<number, Address> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
};

/** Dead address for token burns */
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as Address;

/** Endpoint prices in USD */
export const ENDPOINT_PRICES = {
  RELIABILITY: "$0.01",
  LIVENESS_PROOF: "$0.005",
  GLOBAL_STATS: "$0.03",
  PEER_CORRELATION: "$0.02",
  REPUTATION: "$0.01",
  ATTESTATIONS: "$0.01",
} as const;

export * from "./types/attestation.js";
