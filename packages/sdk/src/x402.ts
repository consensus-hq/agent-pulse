/**
 * x402 Payment Helper
 * 
 * Handles signing USDC transferWithAuthorization for x402 API payments.
 * 
 * @module x402
 */

import {
  type Address,
  type Hex,
  type TypedDataDomain,
  encodePacked,
  keccak256,
  stringToHex,
} from "viem";
import {
  type TransferAuthorization,
  type PaymentSettlement,
  type SDKConfig,
  AgentPulseError,
  USDC_ADDRESSES,
  DEFAULTS,
} from "./types.js";

// ============================================================================
// EIP-712 Type Definitions
// ============================================================================

/** EIP-712 domain for USDC on Base */
const EIP712_DOMAIN: TypedDataDomain = {
  name: "USDC",
  version: "2",
  chainId: DEFAULTS.CHAIN_ID,
  verifyingContract: USDC_ADDRESSES[DEFAULTS.CHAIN_ID],
};

/** EIP-712 types for transferWithAuthorization */
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// ============================================================================
// Authorization Helpers
// ============================================================================

/**
 * Generate a random nonce for the authorization
 * @returns 32-byte hex nonce
 */
export function generateNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as Hex;
}

/**
 * Convert USD price string to USDC atomic units
 * @param price - Price string like "$0.01" or "0.01"
 * @returns Amount in micro-USDC (6 decimals)
 */
export function priceToMicroUsdc(price: string): bigint {
  const clean = price.replace("$", "").trim();
  const parsed = parseFloat(clean);
  if (isNaN(parsed) || parsed < 0) {
    throw new AgentPulseError(`Invalid price: ${price}`, "INVALID_ADDRESS");
  }
  return BigInt(Math.floor(parsed * 1_000_000));
}

/**
 * Convert micro-USDC to USD string
 * @param microUsdc - Amount in micro-USDC
 * @returns Formatted USD string
 */
export function microUsdcToPrice(microUsdc: bigint): string {
  return `$${(Number(microUsdc) / 1_000_000).toFixed(6)}`;
}

// ============================================================================
// EIP-712 Signing
// ============================================================================

/**
 * Create EIP-712 domain separator
 * @param domain - EIP-712 domain
 * @returns Domain separator hash
 */
export function createDomainSeparator(domain: TypedDataDomain): Hex {
  const domainTypeHash = keccak256(
    stringToHex(
      "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    )
  );

  const nameHash = keccak256(stringToHex(domain.name || ""));
  const versionHash = keccak256(stringToHex(domain.version || ""));

  return keccak256(
    encodePacked(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        domainTypeHash,
        nameHash,
        versionHash,
        BigInt(domain.chainId || 1),
        domain.verifyingContract || "0x",
      ]
    )
  );
}

/**
 * Hash typed data according to EIP-712
 * @param domain - EIP-712 domain
 * @param types - Type definitions
 * @param message - Message to hash
 * @returns Hash of the typed data
 */
export function hashTypedData(
  domain: TypedDataDomain,
  types: typeof TRANSFER_WITH_AUTHORIZATION_TYPES,
  message: Record<string, unknown>
): Hex {
  const typeString = Object.entries(types)
    .map(([name, fields]) => {
      const fieldString = fields
        .map((f) => `${f.type} ${f.name}`)
        .join(",");
      return `${name}(${fieldString})`;
    })
    .join("")
    .replace("TransferWithAuthorization", "TransferWithAuthorization");

  const typeHash = keccak256(stringToHex(typeString));

  const messageHash = keccak256(
    encodePacked(
      ["bytes32", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
      [
        typeHash,
        message.from as Address,
        message.to as Address,
        message.value as bigint,
        BigInt(message.validAfter as number),
        BigInt(message.validBefore as number),
        message.nonce as Hex,
      ]
    )
  );

  const domainSeparator = createDomainSeparator(domain);
  const prefix = stringToHex("\x19\x01");

  return keccak256(encodePacked(["bytes", "bytes32", "bytes32"], [prefix, domainSeparator, messageHash]));
}

// ============================================================================
// Authorization Creation
// ============================================================================

export interface CreateAuthorizationParams {
  /** Payer address */
  from: Address;
  /** Recipient address (server wallet) */
  to: Address;
  /** Amount in micro-USDC (6 decimals) */
  value: bigint;
  /** Signer function */
  sign: (message: Hex) => Promise<Hex>;
  /** Chain ID (default: 84532) */
  chainId?: number;
  /** Validity window in seconds (default: 300 = 5 minutes) */
  validitySeconds?: number;
}

/**
 * Create a transferWithAuthorization signature
 * 
 * This creates an EIP-712 signature that authorizes a USDC transfer
 * without requiring an on-chain transaction from the sender.
 * 
 * @param params - Authorization parameters
 * @returns Transfer authorization with signature
 */
export async function createTransferAuthorization(
  params: CreateAuthorizationParams
): Promise<TransferAuthorization> {
  const {
    from,
    to,
    value,
    sign,
    chainId = DEFAULTS.CHAIN_ID,
    validitySeconds = 300,
  } = params;

  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60; // Valid from 1 minute ago (clock skew buffer)
  const validBefore = now + validitySeconds;
  const nonce = generateNonce();

  const domain: TypedDataDomain = {
    ...EIP712_DOMAIN,
    chainId,
    verifyingContract: USDC_ADDRESSES[chainId] || USDC_ADDRESSES[DEFAULTS.CHAIN_ID],
  };

  const message = {
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
  };

  // Create the hash to sign
  const hash = hashTypedData(domain, TRANSFER_WITH_AUTHORIZATION_TYPES, message);

  // Sign the hash
  const signature = await sign(hash);

  return {
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
    signature,
  };
}

// ============================================================================
// x402 Payment Header
// ============================================================================

/**
 * Encode authorization for x402 payment header
 * @param auth - Transfer authorization
 * @returns Base64-encoded payment header value
 */
export function encodeX402PaymentHeader(auth: TransferAuthorization): string {
  const payload = {
    from: auth.from,
    to: auth.to,
    value: auth.value.toString(),
    validAfter: auth.validAfter,
    validBefore: auth.validBefore,
    nonce: auth.nonce,
    signature: auth.signature,
    // EIP-712 domain info
    domain: {
      name: "USDC",
      version: "2",
      chainId: DEFAULTS.CHAIN_ID,
      verifyingContract: USDC_ADDRESSES[DEFAULTS.CHAIN_ID],
    },
  };

  return btoa(JSON.stringify(payload));
}

/**
 * Decode x402 payment header
 * @param header - Base64-encoded payment header
 * @returns Decoded transfer authorization
 */
export function decodeX402PaymentHeader(header: string): Omit<TransferAuthorization, "signature"> & {
  signature: Hex;
  domain: Record<string, unknown>;
} {
  const decoded = JSON.parse(atob(header));
  
  return {
    from: decoded.from as Address,
    to: decoded.to as Address,
    value: BigInt(decoded.value),
    validAfter: decoded.validAfter,
    validBefore: decoded.validBefore,
    nonce: decoded.nonce as Hex,
    signature: decoded.signature as Hex,
    domain: decoded.domain,
  };
}

// ============================================================================
// Payment Settlement (Client-side)
// ============================================================================

export interface SettlePaymentParams {
  /** API endpoint URL */
  url: string;
  /** HTTP method */
  method?: string;
  /** Payment header value */
  paymentData: string;
  /** Server wallet address to verify */
  payTo: Address;
  /** Price that should be paid */
  price: string;
}

/**
 * x402 Payment Handler
 * 
 * Manages x402 payments for paid API endpoints.
 */
export class X402PaymentHandler {
  private serverWalletAddress?: Address;

  constructor(config?: SDKConfig) {
    this.serverWalletAddress = config?.x402?.serverWalletAddress;
  }

  /**
   * Check if a response indicates payment is required
   * @param response - Fetch response
   * @returns True if 402 status
   */
  isPaymentRequired(response: Response): boolean {
    return response.status === 402;
  }

  /**
   * Extract payment requirements from a 402 response
   * @param response - Fetch response (402)
   * @returns Payment requirements or null
   */
  async getPaymentRequirements(response: Response): Promise<{
    price: string;
    recipient: Address;
    resource: string;
  } | null> {
    if (!this.isPaymentRequired(response)) {
      return null;
    }

    try {
      const data = await response.json() as {
        accepts?: Array<{
          maxAmountRequired?: string;
          price?: string;
          payTo?: string;
          resource?: string;
        }>;
        resource?: string;
      };
      const accepts = data.accepts?.[0];
      
      if (!accepts) {
        return null;
      }

      return {
        price: accepts.maxAmountRequired || accepts.price,
        recipient: accepts.payTo as Address,
        resource: accepts.resource || data.resource,
      };
    } catch {
      // Check headers as fallback
      const price = response.headers.get("X-Payment-Required");
      if (price) {
        return {
          price,
          recipient: this.serverWalletAddress || ("0x" as Address),
          resource: response.url,
        };
      }
      return null;
    }
  }

  /**
   * Create payment headers for an API request
   * @param authorization - Transfer authorization
   * @returns Headers object with payment
   */
  createPaymentHeaders(authorization: TransferAuthorization): Record<string, string> {
    const encoded = encodeX402PaymentHeader(authorization);
    return {
      "x-payment": encoded,
      "X-Payment": encoded,
      "PAYMENT-SIGNATURE": encoded,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Sign an x402 payment authorization
 * 
 * This is the main function for creating x402 payment authorizations.
 * 
 * @example
 * ```typescript
 * const auth = await signX402Payment({
 *   from: "0x...",
 *   to: "0x...",
 *   price: "$0.01",
 *   sign: async (hash) => wallet.signMessage({ message: hash }),
 * });
 * 
 * const headers = {
 *   "x-payment": encodeX402PaymentHeader(auth),
 * };
 * ```
 */
export async function signX402Payment(params: {
  from: Address;
  to: Address;
  price: string;
  sign: (hash: Hex) => Promise<Hex>;
  chainId?: number;
}): Promise<TransferAuthorization> {
  const value = priceToMicroUsdc(params.price);
  
  return createTransferAuthorization({
    from: params.from,
    to: params.to,
    value,
    sign: params.sign,
    chainId: params.chainId,
  });
}

// Re-export types
export type {
  TransferAuthorization,
  PaymentSettlement,
};
