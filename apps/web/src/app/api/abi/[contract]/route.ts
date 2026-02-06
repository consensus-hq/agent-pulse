import { NextResponse } from "next/server";
import pulseRegistryAbi from "@/lib/abi-PulseRegistry.json";
import pulseTokenAbi from "@/lib/abi-PulseToken.json";
import peerAttestationAbi from "@/lib/abi-PeerAttestation.json";
import burnWithFeeAbi from "@/lib/abi-BurnWithFee.json";

export const runtime = 'edge';

const CHAIN_ID = parseInt(process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || "84532", 10);

const CONTRACT_MAP: Record<string, any> = {
  "PulseRegistry": {
    address: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
    abi: pulseRegistryAbi,
    chainId: CHAIN_ID
  },
  "PulseToken": {
    address: process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS,
    abi: pulseTokenAbi,
    chainId: CHAIN_ID
  },
  "PeerAttestation": {
    address: process.env.NEXT_PUBLIC_PEER_ATTESTATION_ADDRESS,
    abi: peerAttestationAbi,
    chainId: CHAIN_ID
  },
  "BurnWithFee": {
    address: process.env.NEXT_PUBLIC_BURN_WITH_FEE_ADDRESS,
    abi: burnWithFeeAbi,
    chainId: CHAIN_ID
  }
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contract: string }> }
) {
  const { contract } = await params;
  const data = CONTRACT_MAP[contract];
  
  if (!data) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }
  
  return NextResponse.json(data);
}
