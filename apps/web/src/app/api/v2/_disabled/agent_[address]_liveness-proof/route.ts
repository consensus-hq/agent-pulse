// @ts-nocheck
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getContract, readContract } from "thirdweb";
import { baseSepolia } from "thirdweb/chains";
import { createThirdwebClient } from "thirdweb";
import { SignJWT } from "jose";
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
 * Agent Liveness Proof Endpoint
 *
 * Price: $0.005 per call (paid tier)
 * Cache: 30 seconds
 *
 * Returns liveness proof for an agent:
 * - isAlive: boolean
 * - lastPulse: Unix timestamp of last pulse
 * - staleness: Seconds since last pulse
 * - proofToken: Signed JWT proving liveness
 */

const ENDPOINT: V2Endpoint = "livenessProof";
const PRICE = PRICES[ENDPOINT];
const CACHE_TTL = CACHE_TTLS[ENDPOINT];

// Thirdweb client for reading from chain
const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "eb7c5229642079dddc042df63a7a1f42",
});

// JWT secret for signing proof tokens (in production, use a proper secret from env)
const JWT_SECRET = new TextEncoder().encode(
  process.env.LIVENESS_JWT_SECRET || "agent-pulse-liveness-secret-key-min-32-chars-long"
);

interface LivenessProofData {
  agent: string;
  isAlive: boolean;
  lastPulse: number;
  staleness: number;
  proofToken: string;
  verifiedAt: string;
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
 * Generate a signed JWT proof token for liveness
 */
async function generateProofToken(
  agentAddress: string,
  isAlive: boolean,
  lastPulse: number,
  staleness: number
): Promise<string> {
  const token = await new SignJWT({
    agent: agentAddress,
    isAlive,
    lastPulse,
    staleness,
    scope: "liveness-proof",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h") // Proof valid for 1 hour
    .setAudience("agent-pulse-v2")
    .setIssuer("agent-pulse-api")
    .sign(JWT_SECRET);

  return token;
}

/**
 * Get liveness data from registry contract
 */
async function getLivenessData(agentAddress: string): Promise<Omit<LivenessProofData, "_tier" | "_cached" | "_cachedAt" | "_payment">> {
  // Get agent status from registry contract
  const registry = getContract({
    client: thirdwebClient,
    chain: baseSepolia,
    address: REGISTRY_CONTRACT,
    abi: PULSE_REGISTRY_ABI,
  });

  // Read agent status from contract
  const statusResult = await readContract({
    contract: registry,
    method: "getAgentStatus",
    params: [agentAddress as `0x${string}`],
  }).catch(() => null);

  const now = Math.floor(Date.now() / 1000);

  if (!statusResult) {
    // Agent not found or error
    const proofToken = await generateProofToken(agentAddress, false, 0, Infinity);
    return {
      agent: agentAddress,
      isAlive: false,
      lastPulse: 0,
      staleness: Infinity,
      proofToken,
      verifiedAt: new Date().toISOString(),
    };
  }

  const [alive, lastPulseAt] = statusResult;

  const isAlive = alive;
  const lastPulse = Number(lastPulseAt);
  const staleness = now - lastPulse;

  const proofToken = await generateProofToken(agentAddress, isAlive, lastPulse, staleness);

  return {
    agent: agentAddress,
    isAlive,
    lastPulse,
    staleness,
    proofToken,
    verifiedAt: new Date().toISOString(),
  };
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
  const cacheKey = `v2:liveness:${normalizedAddress}`;

  return x402Gate<LivenessProofData>(
    request,
    {
      endpoint: ENDPOINT,
      price: PRICE,
      cacheKey,
    },
    async (payment?: { payer: string; amount: string; timestamp: string }) => {
      // Check cache first (short TTL for liveness data)
      const cached = await kv.get<LivenessProofData>(cacheKey);
      if (cached) {
        return NextResponse.json({
          ...cached,
          _cached: true,
          _cachedAt: new Date().toISOString(),
          _payment: payment,
          _tier: "paid" as const,
        });
      }

      // Get liveness data
      const data = await getLivenessData(normalizedAddress);

      // Cache the result
      const result: LivenessProofData = {
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
