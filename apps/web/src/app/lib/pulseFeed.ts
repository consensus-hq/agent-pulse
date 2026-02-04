export type PulseFeedItem = {
  agent: string;
  lastSeen: string;
  streak: string;
  amount: string;
  note: string;
  txHash?: string;
  explorerUrl?: string;
};

const fallbackFeed: PulseFeedItem[] = [
  {
    agent: "agent-001",
    lastSeen: "2m ago",
    streak: "5 pulses",
    amount: "1 PULSE",
    note: "heartbeat",
    txHash:
      "0x3f8b1c2d3e4f5a6b7c8d9e0f1234567890abcdef1234567890abcdef123456",
  },
  {
    agent: "agent-014",
    lastSeen: "11m ago",
    streak: "18 pulses",
    amount: "1 PULSE",
    note: "schedule",
    txHash:
      "0x7c1e2f3a4b5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2f3a4b5d6e7f8091a2b3c4",
  },
  {
    agent: "agent-072",
    lastSeen: "42m ago",
    streak: "3 pulses",
    amount: "1 PULSE",
    note: "manual pulse",
    txHash:
      "0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8",
  },
];

export async function loadPulseFeed(): Promise<PulseFeedItem[]> {
  const url = process.env.NEXT_PUBLIC_PULSE_FEED_URL;
  if (!url) {
    return fallbackFeed;
  }

  try {
    const response = await fetch(url, {
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      return fallbackFeed;
    }

    const data = (await response.json()) as PulseFeedItem[];
    if (!Array.isArray(data) || data.length === 0) {
      return fallbackFeed;
    }

    return data;
  } catch {
    return fallbackFeed;
  }
}
