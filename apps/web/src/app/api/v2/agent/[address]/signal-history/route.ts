export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getContract, getEvents } from "thirdweb";
import { baseSepolia } from "thirdweb/chains";
import { createThirdwebClient } from "thirdweb";
import {
  x402Gate,
  PRICES,
  CACHE_TTLS,
  isValidAddress,
  normalizeAddress,
  type V2Endpoint,
  REGISTRY_CONTRACT,
} from "../../../_lib/x402-gate";
import { PULSE_REGISTRY_ABI } from "../../../../abi/route";

/**
 * Agent Signal History Endpoint
 *
 * Price: $0.015 per call (paid tier)
 * Cache: 15 minutes (900s)
 *
 * Returns signal history for an agent:
 * - totalSignaled: Total PULSE tokens signaled
 * - signalRate: Tokens signaled per day (average)
 * - history: Array of signal events
 */

const ENDPOINT: V2Endpoint = "signalHistory";
const PRICE = PRICES[ENDPOINT];
const CACHE_TTL = CACHE_TTLS[ENDPOINT];

// Thirdweb client for reading from chain
const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "eb7c5229642079dddc042df63a7a1f42",
});

interface SignalEvent {
  txHash: string;
  amount: string;
  timestamp: number;
  streakAtSignal: number;
}

interface SignalHistoryData {
  agent: string;
  totalSignaled: string;
  signalRate: string;
  signalRateUnit: "PULSE/day";
  history: SignalEvent[];
  historyCount: number;
  firstSignalAt: number | null;
  lastSignalAt: number | null;
  _tier?: "free" | "paid";
  _cached?: boolean;
  _cachedAt?: string;
  _payment?: {
    payer: string;
    amount: string;
    timestamp: string;
  };
}

/**
 * Get signal history from Pulse events
 */
async function getSignalHistory(agentAddress: string): Promise<Omit<SignalHistoryData, "_tier" | "_cached" | "_cachedAt" | "_payment">> {
  const registry = getContract({
    client: thirdwebClient,
    chain: baseSepolia,
    address: REGISTRY_CONTRACT,
    abi: PULSE_REGISTRY_ABI,
  });

  // Get Pulse events for this agent
  // Note: In a production environment, you'd want to use a subgraph or indexer
  // for efficient event querying. Here we'll simulate with contract reads.

  try {
    // Fetch events from the contract
    const events = await getEvents({
      contract: registry,
      events: [
        {
          type: "event",
          name: "Pulse",
          inputs: [
            { name: "agent", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
            { name: "timestamp", type: "uint256", indexed: false },
            { name: "streak", type: "uint256", indexed: false },
          ],
        },
      ],
      fromBlock: 0n,
      toBlock: "latest",
    });

    // Filter events for this agent
    const agentEvents = events.filter(
      (event: { args: { agent?: string } }) => event.args.agent?.toLowerCase() === agentAddress.toLowerCase()
    );

    // Build history
    const history: SignalEvent[] = agentEvents.map((event: { transactionHash?: string; args: { amount?: bigint; timestamp?: bigint; streak?: bigint } }) => ({
      txHash: event.transactionHash || "",
      amount: event.args.amount?.toString() || "0",
      timestamp: Number(event.args.timestamp || 0),
      streakAtSignal: Number(event.args.streak || 0),
    }));

    // Sort by timestamp descending
    history.sort((a, b) => b.timestamp - a.timestamp);

    // Calculate totals
    const totalSignaled = history.reduce((sum, event) => {
      return sum + BigInt(event.amount);
    }, 0n);

    // Calculate signal rate (tokens per day)
    let signalRate = "0";
    if (history.length >= 2) {
      const firstSignal = history[history.length - 1].timestamp;
      const lastSignal = history[0].timestamp;
      const daysActive = (lastSignal - firstSignal) / 86400;

      if (daysActive > 0) {
        const rate = Number(totalSignaled) / daysActive;
        signalRate = rate.toFixed(0);
      }
    } else if (history.length === 1) {
      // Single signal - rate is just that amount
      signalRate = history[0].amount;
    }

    return {
      agent: agentAddress,
      totalSignaled: totalSignaled.toString(),
      signalRate,
      signalRateUnit: "PULSE/day",
      history: history.slice(0, 50), // Limit to 50 most recent events
      historyCount: history.length,
      firstSignalAt: history.length > 0 ? history[history.length - 1].timestamp : null,
      lastSignalAt: history.length > 0 ? history[0].timestamp : null,
    };
  } catch (error) {
    console.error("[Signal History] Error fetching events:", error);

    // Return empty history on error
    return {
      agent: agentAddress,
      totalSignaled: "0",
      signalRate: "0",
      signalRateUnit: "PULSE/day",
      history: [],
      historyCount: 0,
      firstSignalAt: null,
      lastSignalAt: null,
    };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  const { address } = await params;

  // Validate address
  if (!address || !isValidAddress(address)) {
    return NextResponse.json(
      { error: "Invalid agent address. Must be a valid Ethereum address (0x...)." },
      { status: 400 }
    );
  }

  const normalizedAddress = normalizeAddress(address);
  const cacheKey = `v2:signal:${normalizedAddress}`;

  return x402Gate<SignalHistoryData>(
    request,
    {
      endpoint: ENDPOINT,
      price: PRICE,
      cacheKey,
    },
    async (payment?: { payer: string; amount: string; timestamp: string }) => {
      // Check cache first
      const cached = await kv.get<SignalHistoryData>(cacheKey);
      if (cached) {
        return NextResponse.json({
          ...cached,
          _cached: true,
          _cachedAt: new Date().toISOString(),
          _payment: payment,
          _tier: "paid" as const,
        });
      }

      // Get signal history
      const data = await getSignalHistory(normalizedAddress);

      // Cache the result
      const result: SignalHistoryData = {
        ...data,
        _tier: "paid",
      };
      await kv.set(cacheKey, result, { ex: CACHE_TTL });

      return NextResponse.json({
        ...result,
        _payment: payment,
      });
    }
  );
}

// Support HEAD for health checks
export async function HEAD(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200 });
}
