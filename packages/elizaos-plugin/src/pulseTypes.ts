/**
 * Agent Pulse Protocol Types
 * 
 * Type definitions for the ElizaOS Agent Pulse plugin.
 * @module types
 */

import { type Memory, type State } from "@elizaos/core";

// ============================================================================
// Agent Status Types
// ============================================================================

/**
 * Response from getAgentStatus API endpoint
 */
export interface AgentStatus {
  /** Whether the agent is currently alive (within TTL) */
  alive: boolean;
  /** Unix timestamp of the last pulse */
  lastPulse: number;
  /** Current pulse streak (consecutive days) */
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

// ============================================================================
// Protocol Configuration Types
// ============================================================================

/**
 * Protocol configuration returned by /api/config
 */
export interface ProtocolConfig {
  /** Network configuration */
  network: {
    chainId: number;
    name: string;
    rpcUrl: string;
  };
  /** Contract addresses */
  contracts: {
    pulseToken: `0x${string}`;
    pulseRegistry: `0x${string}`;
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
// Pulse Action Types
// ============================================================================

/**
 * Parameters for sending a pulse
 */
export interface SendPulseParams {
  /** Agent's Ethereum address */
  agentAddress: `0x${string}`;
  /** Amount to pulse in wei (default: 1e18) */
  amount?: string;
}

/**
 * Response from successful pulse transaction
 */
export interface PulseResponse {
  success: boolean;
  /** Transaction hash */
  txHash: string;
  /** New streak count after pulse */
  streak: number;
}

// ============================================================================
// Plugin State Types
// ============================================================================

/**
 * Extended state for Agent Pulse plugin
 */
export interface PulsePluginState extends State {
  /** Current agent status (if loaded) */
  agentStatus?: AgentStatus;
  /** Protocol configuration */
  protocolConfig?: ProtocolConfig;
  /** Last error message */
  lastError?: string;
  /** Last pulse timestamp */
  lastPulseAt?: number;
}

/**
 * Memory type for pulse history
 */
export interface PulseMemory extends Memory {
  content: {
    text: string;
    agentAddress: `0x${string}`;
    txHash: string;
    amount: string;
    streak: number;
    timestamp: number;
  };
}

// ============================================================================
// v2 API Analytics Types
// ============================================================================

/**
 * Reliability metrics from v2 /agent/{address}/reliability
 */
export interface ReliabilityMetrics {
  /** Agent's Ethereum address */
  address: `0x${string}`;
  /** Overall reliability score (0-100) */
  reliabilityScore: number;
  /** Percentage of time agent was alive */
  uptimePercent: number;
  /** Variance in pulse interval consistency */
  jitter: number;
  /** Predicted failure probability (0-1) */
  hazardRate: number;
  /** ISO timestamp of last update */
  lastUpdated: string;
}

/**
 * Liveness proof from v2 /agent/{address}/liveness-proof
 */
export interface LivenessProof {
  /** Agent's Ethereum address */
  address: `0x${string}`;
  /** Whether agent has pulsed within TTL */
  isAlive: boolean;
  /** ISO timestamp of last pulse */
  lastPulse: string;
  /** Seconds since last pulse */
  staleness: number;
  /** Signed JWT proof token */
  proofToken: string;
}

/**
 * Global network stats from v2 /network/global-stats
 */
export interface GlobalStats {
  /** Total agents currently alive */
  totalActiveAgents: number;
  /** Average pulse streak across network */
  averageStreak: number;
  /** Total PULSE transferred to signal sink */
  networkSignalRate: number;
  /** Network-wide average reliability */
  averageReliability: number;
  /** Overall network health */
  networkHealth: "healthy" | "degraded" | "unhealthy";
}

/**
 * Peer correlation from v2 /network/peer-correlation/{address}
 */
export interface PeerCorrelation {
  /** Agent's Ethereum address */
  address: `0x${string}`;
  /** Correlation coefficient (0-1) */
  peerCorrelation: number;
  /** Addresses with similar liveness patterns */
  similarAgents: `0x${string}`[];
  /** Cluster identifier for grouping */
  clusterId: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * x402 payment requirements response
 */
export interface X402Requirements {
  required: boolean;
  amount: string;
  token: string;
  recipient: string;
}