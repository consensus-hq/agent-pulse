import { NextResponse } from "next/server";

const CHAIN_ID = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || "8453";
const NETWORK_NAMES: Record<string, string> = {
  "8453": "Base",
  "84532": "Base Sepolia",
};

export async function GET() {
  const pulseToken = process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS || "";
  const signalSink = process.env.SIGNAL_SINK_ADDRESS || process.env.NEXT_PUBLIC_SIGNAL_SINK_ADDRESS || "";
  const chainId = parseInt(CHAIN_ID, 10);

  return NextResponse.json({
    description: "Agent Pulse — x402-powered liveness protocol. Agents pay PULSE tokens to prove activity and maintain routing eligibility.",
    network: NETWORK_NAMES[CHAIN_ID] || `Chain ${CHAIN_ID}`,
    chainId,
    contracts: {
      pulseToken,
      pulseRegistry: process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS || "",
      identityRegistry: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS || "",
      reputationRegistry: process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS || "",
      treasurySafe: process.env.NEXT_PUBLIC_TREASURY_SAFE_ADDRESS || "",
      signalSink,
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
