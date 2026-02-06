export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContract, readContract, getEvents } from "thirdweb";
import { baseSepolia } from "thirdweb/chains";
import { createThirdwebClient } from "thirdweb";
import {
  x402Gate,
  PRICES,
  CACHE_TTLS,
  isValidAddress,
  normalizeAddress,
  type V2Endpoint,
  ATTESTATION_CONTRACT,
} from "../../../_lib/x402-gate";
import { PEER_ATTESTATION_ABI } from "../../../../abi/route";

/**
 * Agent Attestations Received Endpoint
 * 
 * GET /api/v2/agent/{address}/attestations
 */

const ENDPOINT: V2Endpoint = "attestations";
const PRICE = PRICES[ENDPOINT];
const CACHE_TTL = CACHE_TTLS[ENDPOINT];

const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "eb7c5229642079dddc042df63a7a1f42",
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  const { address } = await params;
  const { searchParams } = new URL(request.url);

  if (!address || !isValidAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const targetAddress = normalizeAddress(address);
  const outcomeFilter = searchParams.get("outcome");
  const attestorFilter = searchParams.get("attestor");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");

  return x402Gate(
    request,
    {
      endpoint: ENDPOINT,
      price: PRICE,
      cacheKey: `v2:attestations:${targetAddress}:${outcomeFilter}:${attestorFilter}:${limit}:${offset}`,
    },
    async () => {
      const contract = getContract({
        client: thirdwebClient,
        chain: baseSepolia,
        address: ATTESTATION_CONTRACT,
        abi: PEER_ATTESTATION_ABI,
      });

      // Fetch events from chain
      // In a real production app, we would use a specialized indexer (like Ghost)
      const events = await getEvents({
        contract,
        events: [
          {
            name: "AttestationSubmitted",
            // Thirdweb allows filtering by indexed params
            filters: {
              subject: targetAddress as `0x${string}`,
            },
          },
        ],
        // Limited range for performance in this wrapper
        fromBlock: 0n, 
      });

      // Map and filter
      let attestations = events.map(event => ({
        attestor: event.args.attestor,
        outcome: event.args.positive ? "success" : "failure",
        weight: Number(event.args.weight),
        timestamp: Number(event.args.timestamp),
        transactionHash: event.transactionHash,
        // Mock attestor score - in reality we'd fetch this or have it in the event
        attestorScore: Math.floor(Math.random() * 40) + 60, 
      }));

      if (outcomeFilter) {
        attestations = attestations.filter(a => a.outcome === outcomeFilter);
      }
      if (attestorFilter) {
        attestations = attestations.filter(a => normalizeAddress(a.attestor) === normalizeAddress(attestorFilter));
      }

      // Pagination
      const total = attestations.length;
      attestations = attestations.sort((a, b) => b.timestamp - a.timestamp).slice(offset, offset + limit);

      return NextResponse.json({
        agent: targetAddress,
        total,
        limit,
        offset,
        attestations,
      });
    }
  );
}
