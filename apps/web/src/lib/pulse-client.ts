import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

interface PulseResponse {
  success: boolean;
  agent: string;
  paidAmount: string;
}

export async function sendPulse(agentAddress: string, privateKey: string): Promise<PulseResponse> {
  const response = await fetch("/api/pulse", {
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

  const paidResponse = await fetch("/api/pulse", {
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
