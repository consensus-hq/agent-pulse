import { NextResponse } from "next/server";
import pulseRegistryAbi from "@/lib/abi-PulseRegistry.json";
import pulseTokenAbi from "@/lib/abi-PulseToken.json";
import peerAttestationAbi from "@/lib/abi-PeerAttestation.json";
import burnWithFeeAbi from "@/lib/abi-BurnWithFee.json";

export const runtime = 'edge';

const CONTRACTS = {
  PulseRegistry: {
    address: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
    abi: pulseRegistryAbi,
    chainId: 84532
  },
  PulseToken: {
    address: process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS,
    abi: pulseTokenAbi,
    chainId: 84532
  },
  PeerAttestation: {
    address: process.env.NEXT_PUBLIC_PEER_ATTESTATION_ADDRESS,
    abi: peerAttestationAbi,
    chainId: 84532
  },
  BurnWithFee: {
    address: process.env.NEXT_PUBLIC_BURN_WITH_FEE_ADDRESS,
    abi: burnWithFeeAbi,
    chainId: 84532
  }
};

export async function GET() {
  return NextResponse.json({
    contracts: CONTRACTS,
    version: "1.0.0"
  });
}
