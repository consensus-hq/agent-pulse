import type { Address, Hash } from "viem";

/**
 * Outcome of a peer interaction
 */
export type AttestationOutcome = "success" | "failure" | "timeout";

/**
 * Options for submitting an attestation
 */
export interface AttestOptions {
  /** Optional metadata about the interaction */
  reason?: string;
  /** Custom interaction ID */
  interactionId?: string;
  /** Override the weight (usually handled by contract) */
  weight?: bigint;
}

/**
 * Response from an attestation submission
 */
export interface AttestResponse {
  success: boolean;
  /** Transaction hash on-chain */
  txHash: Hash;
  /** Subject address */
  subject: Address;
  /** Outcome recorded */
  outcome: AttestationOutcome;
  /** Updated composite reputation score of the subject */
  newScore: number;
}

/**
 * Detailed reputation data for an agent
 */
export interface Reputation {
  /** On-chain self-pulse metrics */
  selfPulse: {
    /** Current pulse streak */
    streak: number;
    /** Consistency score 0-1 (inverse of hazard score) */
    consistency: number;
    /** Timestamp of last pulse */
    lastPulse: number;
  };
  /** Aggregate peer attestation metrics */
  peerAttestations: {
    /** Ratio of positive attestations (0-1) */
    positiveRatio: number;
    /** Total number of negative attestations */
    negativeCount: number;
    /** Weighted average of all attestations (0-100) */
    weightedAvg: number;
    /** Number of unique agents who have attested */
    uniqueAttestors: number;
  };
  /** Composite score combining self and peer metrics */
  composite: {
    /** Final reputation score (0-100) */
    score: number;
    /** Percentile ranking relative to other agents (0-1) */
    percentile: number;
  };
}

/**
 * A single attestation record
 */
export interface Attestation {
  /** Address of the agent who attested */
  attestor: Address;
  /** Address of the agent being attested to */
  subject: Address;
  /** Outcome of the interaction */
  outcome: AttestationOutcome;
  /** Weight of this attestation (based on attestor reputation) */
  weight: number;
  /** Unix timestamp of the attestation */
  timestamp: number;
  /** Transaction hash */
  txHash?: Hash;
  /** Optional metadata */
  reason?: string;
}

/**
 * Query parameters for fetching attestations
 */
export interface GetAttestationsOptions {
  /** Maximum records to return (default 20) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Filter by outcome */
  outcome?: AttestationOutcome;
  /** Filter by timestamp (unix seconds) */
  since?: number;
}

/**
 * Paginated list of attestations
 */
export interface AttestationList {
  items: Attestation[];
  total: number;
  hasMore: boolean;
}

/**
 * Options for the withAttestation wrapper
 */
export interface WithAttestationOptions extends AttestOptions {
  /** Maximum time in ms before marking as 'timeout' (default 30s) */
  timeoutMs?: number;
}
