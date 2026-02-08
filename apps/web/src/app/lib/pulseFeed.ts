export type PulseFeedItem = {
  agent: string;
  lastSeen: string;
  streak: string;
  amount: string;
  note: string;
  txHash?: string;
  explorerUrl?: string;
};

/**
 * Current API response format from /api/pulse-feed
 */
type PulseFeedResponse = {
  data: Array<{
    agent: string;
    amount: string;
    timestamp: number;
    streak: number;
    blockNumber: number;
    transactionHash: string;
    logIndex: number;
    timestampFormatted: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    totalEvents: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  meta: {
    requestId: string;
    durationMs: number;
    timestamp: number;
  };
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
    const pulses = data.data ?? [];

    if (pulses.length === 0) {
      return fallbackFeed;
    }

    return pulses.map((pulse) => ({
      agent: pulse.agent,
      lastSeen: toIso(pulse.timestamp),
      streak: pulse.streak > 0 ? `${pulse.streak} day streak` : "new",
      amount: pulse.amount,
      note: "alive",
      txHash: pulse.transactionHash,
      explorerUrl: `https://basescan.org/tx/${pulse.transactionHash}`,
    }));
  } catch {
    return fallbackFeed;
  }
}
