// @ts-nocheck
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getContract, sendTransaction, readContract } from "thirdweb";
import { baseSepolia } from "thirdweb/chains";
import { createThirdwebClient } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
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
 * Agent Attest Endpoint
 * 
 * POST /api/v2/agent/{address}/attest
 * 
 * Body: { outcome: 'success'|'failure'|'timeout', taskId?, details? }
 * 
 * Submits an on-chain attestation for the target agent.
 * The 'outcome' is mapped to a boolean 'positive' value.
 */

const ENDPOINT: V2Endpoint = "attest";
const PRICE = PRICES[ENDPOINT];

const thirdwebClient = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY,
});

// Server-side account to sign and submit the on-chain attestation
const serverAccount = privateKeyToAccount({
  client: thirdwebClient,
  privateKey: process.env.SERVER_PRIVATE_KEY || "",
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  const { address } = await params;

  if (!address || !isValidAddress(address)) {
    return NextResponse.json(
      { error: "Invalid agent address." },
      { status: 400 }
    );
  }

  const targetAddress = normalizeAddress(address);

  return x402Gate(
    request,
    {
      endpoint: ENDPOINT,
      price: PRICE,
    },
    async (payment) => {
      try {
        const body = await request.json();
        const { outcome, taskId, details } = body;

        if (!['success', 'failure', 'timeout'].includes(outcome)) {
          return NextResponse.json({ error: "Invalid outcome. Must be 'success', 'failure', or 'timeout'." }, { status: 400 });
        }

        const positive = outcome === 'success';
        const attestorAddress = payment?.payer || "unknown";

        // 1. Validate caller (attestor) is alive on-chain
        const registryContract = getContract({
          client: thirdwebClient,
          chain: baseSepolia,
          address: REGISTRY_CONTRACT,
          abi: PULSE_REGISTRY_ABI,
        });

        const isAttestorAlive = await readContract({
          contract: registryContract,
          method: "isAlive",
          params: [attestorAddress as `0x${string}`],
        }).catch(() => false);

        if (!isAttestorAlive) {
          return NextResponse.json({ error: "Attestor must be an alive agent in PulseRegistryV2." }, { status: 403 });
        }

        // 2. Validate target is alive
        const isTargetAlive = await readContract({
          contract: registryContract,
          method: "isAlive",
          params: [targetAddress as `0x${string}`],
        }).catch(() => false);

        if (!isTargetAlive) {
          return NextResponse.json({ error: "Target agent must be alive in PulseRegistryV2." }, { status: 404 });
        }

        // 3. Submit on-chain attestation
        // Note: In a production environment, we'd likely want the agent themselves to sign,
        // but the prompt implies this API wraps the submission.
        const attestationContract = getContract({
          client: thirdwebClient,
          chain: baseSepolia,
          address: ATTESTATION_CONTRACT,
          abi: PEER_ATTESTATION_ABI,
        });

        const transaction = sendTransaction({
          account: serverAccount,
          transaction: {
            contract: attestationContract,
            method: "attest",
            params: [targetAddress as `0x${string}`, positive],
          },
        });

        // For this implementation, we wait for submission and return tx hash
        const { transactionHash } = await transaction;

        // 4. Calculate updated (mock/estimated) composite score
        // In a real system, this might be pulled from an indexer or re-calculated
        const compositeScore = 75.5; // Placeholder

        return NextResponse.json({
          status: "submitted",
          transactionHash,
          target: targetAddress,
          attestor: attestorAddress,
          outcome,
          compositeScore,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Attestation error:", error);
        return NextResponse.json({ error: "Failed to submit attestation." }, { status: 500 });
      }
    }
  );
}
