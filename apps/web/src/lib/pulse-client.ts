import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

interface PulseResponse {
  success: boolean;
  agent: string;
  paidAmount: string;
}

/**
 * Send a pulse signal via x402 micropayment.
 * @param agentAddress - The agent's Ethereum address
 * @param privateKey - The agent's private key for EIP-712 signing
 * @param baseUrl - Absolute base URL of the Agent Pulse API (e.g. "https://agent-pulse-nine.vercel.app")
 */
export async function sendPulse(agentAddress: string, privateKey: string, baseUrl: string): Promise<PulseResponse> {
  const pulseUrl = `${baseUrl.replace(/\/+$/, "")}/api/pulse`;

  const response = await fetch(pulseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: agentAddress }),
  });

  if (response.status !== 402) {
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Pulse request failed: ${response.status} ${errorBody}`);
    }
    return (await response.json()) as PulseResponse;
  }

  const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED");
  if (!paymentRequiredHeader) {
    throw new Error("Missing PAYMENT-REQUIRED header in x402 response.");
  }

  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const signer = toClientEvmSigner(account);
  const client = new x402Client();

  for (const requirement of paymentRequired.accepts) {
    client.register(requirement.network, new ExactEvmScheme(signer));
  }

  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  const paymentHeader = encodePaymentSignatureHeader(paymentPayload);

  const paidResponse = await fetch(pulseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": paymentHeader,
    },
    body: JSON.stringify({ agent: agentAddress }),
  });

  if (!paidResponse.ok) {
    const errorBody = await paidResponse.text();
    throw new Error(`Pulse payment failed: ${paidResponse.status} ${errorBody}`);
  }

  return (await paidResponse.json()) as PulseResponse;
}
