export type StatusResponse = {
  address: string;
  isAlive: boolean;
  lastPulseAt: number;
  streak: number;
  hazardScore: number;
  ttlSeconds: number;
  updatedAt: number;
  error?: string;
};

/** Pulse event from API */
export type PulseEvent = {
  agent: string;
  amount: string;
  timestamp: number;
  streak: number;
  txHash?: string;
  transactionHash?: string;  // API returns this field name
  blockNumber?: number | string;
  logIndex?: number;
  timestampFormatted?: string;
};

export type PulseFeedResponse = {
  updatedAt?: number;
  cache?: { hit?: boolean; ttlSeconds?: number };
  window?: { fromBlock?: string; toBlock?: string };
  agents?: Array<{
    address: string;
    isAlive: boolean;
    lastPulseAt: number;
    streak: number;
    hazardScore: number;
  }>;
  // API returns .data, legacy code expected .recentPulses
  data?: PulseEvent[];
  recentPulses?: PulseEvent[];
  pagination?: {
    page: number;
    limit: number;
    totalEvents: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  meta?: {
    requestId: string;
    durationMs: number;
    timestamp: number;
  };
  error?: string;
};
