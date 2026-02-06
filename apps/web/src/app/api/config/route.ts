import { NextResponse } from "next/server";

const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "84532";
const PULSE_REGISTRY = process.env.NEXT_PUBLIC_PULSE_REGISTRY || "0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612";
const PULSE_TOKEN = process.env.NEXT_PUBLIC_PULSE_TOKEN || "0x7f24C286872c9594499CD634c7Cc7735551242a2";

export async function GET() {
  return NextResponse.json({
    network: {
      chainId: CHAIN_ID,
      name: CHAIN_ID === "8453" ? "Base" : "Base Sepolia",
      rpc: CHAIN_ID === "8453"
        ? "https://mainnet.base.org"
        : "https://sepolia.base.org",
    },
    contracts: {
      PulseRegistry: PULSE_REGISTRY,
      PulseToken: PULSE_TOKEN,
    },
    api: {
      pulse: "/api/pulse",
      status: "/api/status/{address}",
      protocolHealth: "/api/protocol-health",
      pulseFeed: "/api/pulse-feed",
      abi: "/api/abi",
      defi: "/api/defi",
      docs: "/api/docs",
    },
    x402: {
      version: 2,
      asset: PULSE_TOKEN,
      amount: "1000000000000000000",
      payTo: "0x000000000000000000000000000000000000dEaD",
    },
  });
}
