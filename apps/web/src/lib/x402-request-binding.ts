import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { recoverMessageAddress } from "viem";
import { NonceRegistry } from "./nonce-registry";

/**
 * Request-binding payload structure
 */
export interface X402RequestPayload {
  "x402-version": "1.0";
  "x402-network": string;
  "x402-contract": string;
  "x402-amount": string;
  "x402-sender": string;
  "x402-method": string;
  "x402-path": string;
  "x402-body-hash": string;
  "x402-nonce": string;
  "x402-expires-at": number;
  "x402-signature": string;
}

const MAX_TOKEN_AGE_MS = 60 * 1000; // 60 seconds
const CLOCK_SKEW_MS = 5 * 1000;     // 5 seconds tolerance

/**
 * Calculate SHA-256 hash of request body
 */
export async function calculateBodyHash(body: string | object | null | undefined): Promise<string> {
  let bodyString: string;
  
  if (body === null || body === undefined) {
    bodyString = "";
  } else if (typeof body === "object") {
    bodyString = JSON.stringify(body);
  } else {
    bodyString = body;
  }
  
  const hash = createHash("sha256")
    .update(bodyString, "utf8")
    .digest("hex");
    
  return `0x${hash}`;
}

/**
 * Create deterministic signable payload
 */
export function createSignablePayload(payload: Omit<X402RequestPayload, "x402-signature">): string {
  const orderedPayload = {
    "x402-version": payload["x402-version"],
    "x402-network": payload["x402-network"],
    "x402-contract": payload["x402-contract"],
    "x402-amount": payload["x402-amount"],
    "x402-sender": payload["x402-sender"],
    "x402-method": payload["x402-method"],
    "x402-path": payload["x402-path"],
    "x402-body-hash": payload["x402-body-hash"],
    "x402-nonce": payload["x402-nonce"],
    "x402-expires-at": payload["x402-expires-at"],
  };
  
  return JSON.stringify(orderedPayload, Object.keys(orderedPayload).sort());
}

/**
 * Verify Request Binding
 */
export async function verifyRequestBinding(
  req: NextRequest,
  token: string
): Promise<{ valid: boolean; error?: string; sender?: string }> {
  let payload: X402RequestPayload;
  
  // 1. Parse Token
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    payload = JSON.parse(decoded);
  } catch (e) {
    return { valid: false, error: "INVALID_TOKEN_FORMAT" };
  }

  const sender = payload["x402-sender"];

  // 2. Method Check
  if (payload["x402-method"].toUpperCase() !== req.method.toUpperCase()) {
    return { valid: false, error: "METHOD_MISMATCH", sender };
  }

  // 3. Path Check
  const url = new URL(req.url);
  if (payload["x402-path"] !== url.pathname) {
    return { valid: false, error: "PATH_MISMATCH", sender };
  }

  // 4. Expiry Check
  const now = Date.now();
  const expiryTime = payload["x402-expires-at"] * 1000;
  
  if (now > expiryTime + CLOCK_SKEW_MS) {
    return { valid: false, error: "TOKEN_EXPIRED", sender };
  }
  
  if (expiryTime > now + MAX_TOKEN_AGE_MS + CLOCK_SKEW_MS) {
    return { valid: false, error: "EXPIRY_TOO_FAR_IN_FUTURE", sender };
  }

  // 5. Body Hash Check
  // Note: NextRequest.json() or text() can only be called once. 
  // We may need to clone the request or handle this carefully in actual middleware.
  let body: any = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const clonedReq = req.clone();
      body = await clonedReq.text();
    } catch (e) {
      body = "";
    }
  }
  
  const actualHash = await calculateBodyHash(body);
  if (payload["x402-body-hash"] !== actualHash) {
    return { valid: false, error: "BODY_HASH_MISMATCH", sender };
  }

  // 6. Nonce Check (Replay Protection)
  const isNonceValid = await NonceRegistry.validateAndSet(sender, payload["x402-nonce"]);
  if (!isNonceValid) {
    return { valid: false, error: "NONCE_ALREADY_USED", sender };
  }

  // 7. Signature Check
  try {
    const { "x402-signature": signature, ...rest } = payload;
    const signable = createSignablePayload(rest as any);

    const sig = (signature.startsWith("0x") ? signature : `0x${signature}`) as `0x${string}`;
    const recovered = await recoverMessageAddress({
      message: signable,
      signature: sig,
    });

    if (recovered.toLowerCase() !== sender.toLowerCase()) {
      return { valid: false, error: "INVALID_SIGNATURE", sender };
    }
  } catch (e) {
    return { valid: false, error: "SIGNATURE_VERIFICATION_FAILED", sender };
  }

  return { valid: true, sender };
}
