import { NextResponse } from "next/server";
import { getContractAddress, getChainId } from "@/lib/config";

const CHAIN_ID = getChainId();
const NETWORK_NAMES: Record<string, string> = {
  "1": "Ethereum Mainnet",
  "8453": "Base",
  "84532": "Base Sepolia",
};

export async function GET() {
  const chainId = parseInt(CHAIN_ID, 10);

  return NextResponse.json({
    description: "Agent Pulse — x402-powered liveness protocol. Agents pay PULSE tokens to prove activity and maintain routing eligibility.",
    network: NETWORK_NAMES[CHAIN_ID] || `Chain ${CHAIN_ID}`,
    chainId,
    contracts: {
      pulseToken: getContractAddress("pulseToken"),
      pulseRegistry: getContractAddress("pulseRegistry"),
      identityRegistry: getContractAddress("identityRegistry"),
      burnWithFee: getContractAddress("burnWithFee"),
      peerAttestation: getContractAddress("peerAttestation"),
      reputationRegistry: process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS || "",
      treasurySafe: process.env.NEXT_PUBLIC_TREASURY_SAFE_ADDRESS || "",
      signalSink: process.env.SIGNAL_SINK_ADDRESS || process.env.NEXT_PUBLIC_SIGNAL_SINK_ADDRESS || "",
    },
    api: {
      status: "/api/status/{address}",
      pulseFeed: "/api/pulse-feed",
      pulse: "/api/pulse",
      protocolHealth: "/api/protocol-health",
      config: "/api/config",
    },
    x402: {
      amount: "1000000", // 1 USDC (6 decimals)
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
      payTo:
        process.env.NEXT_PUBLIC_TREASURY_SAFE_ADDRESS ||
        "0xA7940a42c30A7F492Ed578F3aC728c2929103E43",
      network: `eip155:${chainId}`,
    },
  });
}
