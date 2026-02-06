export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContract, readContract } from "thirdweb";
import { baseSepolia } from "thirdweb/chains";
import { createThirdwebClient } from "thirdweb";
import {
  x402Gate,
  PRICES,
  isValidAddress,
  normalizeAddress,
  type V2Endpoint,
  ATTESTATION_CONTRACT,
  REGISTRY_CONTRACT,
} from "../../../_lib/x402-gate";
import { PEER_ATTESTATION_ABI, PULSE_REGISTRY_ABI } from "../../../../abi/route";

/**
 * Agent Reputation Composite Endpoint
 * 
 * GET /api/v2/agent/{address}/reputation
 */

const ENDPOINT: V2Endpoint = "reputation";
const PRICE = PRICES[ENDPOINT];

const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "eb7c5229642079dddc042df63a7a1f42",
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  const { address } = await params;

  if (!address || !isValidAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const targetAddress = normalizeAddress(address);

  return x402Gate(
    request,
    {
      endpoint: ENDPOINT,
      price: PRICE,
      cacheKey: `v2:reputation:${targetAddress}`,
    },
    async () => {
      // 1. Fetch Pulse Data (Self-Pulse Score)
      const registryContract = getContract({
        client: thirdwebClient,
        chain: baseSepolia,
        address: REGISTRY_CONTRACT,
        abi: PULSE_REGISTRY_ABI,
      });

      const status = await readContract({
        contract: registryContract,
        method: "getAgentStatus",
        params: [targetAddress as `0x${string}`],
      }).catch(() => [false, 0n, 0n, 0n]);

      const [alive, lastPulseAt, streak, hazardScore] = status;
      // Simplified calculation for demo
      const selfPulseScore = alive ? Math.min(100, Number(streak) * 5 + (100 - Number(hazardScore)) * 0.5) : 0;

      // 2. Fetch Peer Attestation Data
      const attestationContract = getContract({
        client: thirdwebClient,
        chain: baseSepolia,
        address: ATTESTATION_CONTRACT,
        abi: PEER_ATTESTATION_ABI,
      });

      const stats = await readContract({
        contract: attestationContract,
        method: "getAttestationStats",
        params: [targetAddress as `0x${string}`],
      }).catch(() => [0n, 0n, 0n]);

      const [positiveWeight, negativeWeight, netScore] = stats;
      const totalWeight = Number(positiveWeight) + Number(negativeWeight);
      const positiveRatio = totalWeight > 0 ? Number(positiveWeight) / totalWeight : 0;

      // 3. Compute Composite Score (Algorithm from composite-score.md)
      // f = 0.5 + 0.5 * r * (1 - e^(-v/τ))
      const tau = 1000;
      const v = totalWeight;
      const r = positiveRatio;
      const f = 0.5 + 0.5 * r * (1 - Math.exp(-v / tau));
      const compositeScore = selfPulseScore * f;

      // 4. Mock History & Percentile
      const history = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        score: Math.max(0, compositeScore - Math.random() * 10),
      }));

      return NextResponse.json({
        agent: targetAddress,
        compositeScore: Math.round(compositeScore * 100) / 100,
        percentileRank: 85.4, // Mock
        breakdown: {
          selfPulseScore: Math.round(selfPulseScore * 100) / 100,
          peerFactor: Math.round(f * 100) / 100,
          attestationMetrics: {
            positiveWeight: Number(positiveWeight),
            negativeWeight: Number(negativeWeight),
            netScore: Number(netScore),
            positiveRatio: Math.round(positiveRatio * 100) / 100,
          }
        },
        history,
      });
    }
  );
}
