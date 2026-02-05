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

export type PulseFeedResponse = {
  updatedAt: number;
  cache?: { hit?: boolean; ttlSeconds?: number };
  window?: { fromBlock?: string; toBlock?: string };
  agents?: Array<{
    address: string;
    isAlive: boolean;
    lastPulseAt: number;
    streak: number;
    hazardScore: number;
  }>;
  recentPulses?: Array<{
    agent: string;
    amount: string;
    timestamp: number;
    streak: number;
    txHash?: string;
    blockNumber?: string;
  }>;
  error?: string;
};
