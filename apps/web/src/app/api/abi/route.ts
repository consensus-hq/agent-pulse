export const runtime = "nodejs";

import { NextResponse } from "next/server";

const CHAIN_ID = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || "";

// PulseRegistry ABI (from CONTRACT_SPEC.md)
export const PULSE_REGISTRY_ABI = [
  {
    type: "constructor",
    inputs: [
      { name: "_pulseToken", type: "address" },
      { name: "_signalSink", type: "address" },
      { name: "_ttlSeconds", type: "uint256" },
      { name: "_minPulseAmount", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pulse",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isAlive",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentStatus",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "alive", type: "bool" },
      { name: "lastPulseAt", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "hazardScore", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "updateHazard",
    inputs: [
      { name: "agent", type: "address" },
      { name: "score", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setTTL",
    inputs: [{ name: "newTTL", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMinPulseAmount",
    inputs: [{ name: "newMin", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  { type: "function", name: "pause", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "unpause", inputs: [], outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "pulseToken",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "signalSink",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ttlSeconds",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "minPulseAmount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Pulse",
    anonymous: false,
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "streak", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "HazardUpdated",
    anonymous: false,
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "score", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TTLUpdated",
    anonymous: false,
    inputs: [{ name: "newTTL", type: "uint256", indexed: false }],
  },
  {
    type: "event",
    name: "MinPulseAmountUpdated",
    anonymous: false,
    inputs: [{ name: "newMin", type: "uint256", indexed: false }],
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    anonymous: false,
    inputs: [
      { name: "previousOwner", type: "address", indexed: true },
      { name: "newOwner", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Paused",
    anonymous: false,
    inputs: [{ name: "account", type: "address", indexed: false }],
  },
  {
    type: "event",
    name: "Unpaused",
    anonymous: false,
    inputs: [{ name: "account", type: "address", indexed: false }],
  },
] as const;

// Standard ERC20 ABI (plus events)
export const PULSE_TOKEN_ABI = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Approval",
    anonymous: false,
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "spender", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

// PeerAttestation ABI
export const PEER_ATTESTATION_ABI = [
  {
    type: "function",
    name: "attest",
    inputs: [
      { name: "agent", type: "address" },
      { name: "positive", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getAttestationStats",
    inputs: [{ name: "subject", type: "address" }],
    outputs: [
      { name: "positiveWeight", type: "uint256" },
      { name: "negativeWeight", type: "uint256" },
      { name: "netScore", type: "int256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRemainingAttestations",
    inputs: [{ name: "attestor", type: "address" }],
    outputs: [{ name: "remaining", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canAttest",
    inputs: [
      { name: "attestor", type: "address" },
      { name: "subject", type: "address" },
    ],
    outputs: [
      { name: "canAttest", type: "bool" },
      { name: "reason", type: "string" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "AttestationSubmitted",
    anonymous: false,
    inputs: [
      { name: "attestor", type: "address", indexed: true },
      { name: "subject", type: "address", indexed: true },
      { name: "positive", type: "bool", indexed: false },
      { name: "weight", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export type AbiResponse = {
  chainId?: string;
  contracts: {
    PulseRegistry: { abi: readonly unknown[] };
    PulseToken: { abi: readonly unknown[] };
  };
};

export const getAbiResponse = (): AbiResponse => ({
  chainId: CHAIN_ID || undefined,
  contracts: {
    PulseRegistry: { abi: PULSE_REGISTRY_ABI },
    PulseToken: { abi: PULSE_TOKEN_ABI },
  },
});

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getAbiResponse());
}
