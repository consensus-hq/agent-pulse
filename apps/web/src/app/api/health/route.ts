import { NextResponse } from "next/server";
import { getContractAddress, getChainId } from "@/lib/config";

export const runtime = "edge";

/** Deployment epoch – reset each cold start / redeploy. */
const DEPLOY_EPOCH = Date.now();

/** Endpoint inventory (active, non-disabled route files). */
const ENDPOINTS = { free: 15, paid: 7, total: 22 } as const;

const NETWORK_LABELS: Record<string, string> = {
  "1": "ethereum",
  "8453": "base",
  "84532": "base-sepolia",
};

/**
 * GET /api/health
 *
 * Public health-check endpoint for monitoring dashboards and hackathon judges.
 * Returns protocol metadata, deployed contract addresses, and uptime.
 */
export async function GET() {
  const chainId = parseInt(getChainId(), 10);

  return NextResponse.json(
    {
      status: "ok",
      version: "1.0.0",
      uptime: Math.floor((Date.now() - DEPLOY_EPOCH) / 1000),
      contracts: {
        pulseToken: getContractAddress("pulseToken"),
        pulseRegistry: getContractAddress("pulseRegistry"),
        burnWithFee: getContractAddress("burnWithFee"),
        peerAttestation: getContractAddress("peerAttestation"),
        identityRegistry: getContractAddress("identityRegistry"),
      },
      endpoints: ENDPOINTS,
      chain: NETWORK_LABELS[String(chainId)] ?? `chain-${chainId}`,
      chainId,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=30",
      },
    },
  );
}
