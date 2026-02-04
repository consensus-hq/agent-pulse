export type PulseFeedItem = {
  agent: string;
  lastSeen: string;
  streak: string;
  amount: string;
  note: string;
  txHash?: string;
  explorerUrl?: string;
};

type PulseFeedResponse = {
  updatedAt: number;
  cache?: { hit: boolean; ttlSeconds: number };
  window?: { fromBlock: string; toBlock: string };
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
    txHash: string;
    blockNumber: string;
  }>;
};

const fallbackFeed: PulseFeedItem[] = [];

const toIso = (timestamp?: number) => {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toISOString();
};

export async function loadPulseFeed(): Promise<PulseFeedItem[]> {
  const url = process.env.NEXT_PUBLIC_PULSE_FEED_URL ?? "/api/pulse-feed";

  try {
    const response = await fetch(url, {
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      return fallbackFeed;
    }

    const data = (await response.json()) as PulseFeedResponse;
    const pulses = data.recentPulses ?? [];
    const agents = data.agents ?? [];

    if (pulses.length === 0) {
      return fallbackFeed;
    }

    const agentMap = new Map(agents.map((agent) => [agent.address, agent]));

    return pulses.map((pulse) => {
      const agent = agentMap.get(pulse.agent);
      return {
        agent: pulse.agent,
        lastSeen: toIso(agent?.lastPulseAt ?? pulse.timestamp),
        streak: agent ? `${agent.streak} day streak` : `${pulse.streak} day streak`,
        amount: pulse.amount,
        note: agent?.isAlive ? "alive" : "stale",
        txHash: pulse.txHash,
      };
    });
  } catch {
    return fallbackFeed;
  }
}
