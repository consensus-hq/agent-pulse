import { NextResponse } from "next/server";

export async function GET() {
  const pulseToken = process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS || "";
  const signalSink = process.env.NEXT_PUBLIC_SIGNAL_SINK_ADDRESS || "";

  return NextResponse.json({
    network: "Base Sepolia",
    chainId: 84532,
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
      amount: "1000000000000000000",
      asset: pulseToken,
      payTo: signalSink,
    },
  });
}
