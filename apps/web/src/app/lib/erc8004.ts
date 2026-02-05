/**
 * ERC-8004 Identity and Reputation Registry Integration
 * 
 * Contract Addresses (Base Mainnet):
 * - Identity Registry Proxy: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *   Implementation: 0x7274e874ca62410a93bd8bf61c69d8045e399c02
 * - Reputation Registry Proxy: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 *   Implementation: 0x16e0fa7f7c56b9a767e34b192b51f921be31da34
 * 
 * Identity Registry ABI:
 * - ERC721 functions: balanceOf(address), ownerOf(uint256), tokenURI(uint256)
 * - Custom functions:
 *   - getAgentWallet(uint256 agentId) view returns (address)
 *   - isAuthorizedOrOwner(address spender, uint256 agentId) view returns (bool)
 *   - getMetadata(uint256 agentId, string metadataKey) view returns (bytes)
 *   - name() view returns (string) = "AgentIdentity"
 *   - symbol() view returns (string) = "AGENT"
 * 
 * Reputation Registry ABI:
 * - getIdentityRegistry() view returns (address)
 * - getLastIndex(uint256 agentId, address client) view returns (uint64)
 * - readFeedback(uint256 agentId, address client, uint64 index) view returns (int128 value, uint8 decimals, string tag1, string tag2, bool isRevoked)
 * - getSummary(uint256 agentId, address[] clients, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryDecimals)
 * - getClients(uint256 agentId) view returns (address[])
 * - readAllFeedback(agentId, clients, tag1, tag2, includeRevoked) view returns complex tuple
 */

import { createPublicClient, http, isAddress, type Address } from "viem";
import { base } from "viem/chains";

// Contract addresses
export const IDENTITY_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as Address | undefined;
export const REPUTATION_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS as Address | undefined;
// Use server-only BASE_RPC_URL for server-side API routes (H-4 security fix)
const RPC_URL = process.env.BASE_RPC_URL;

// ERC-8004 Identity Registry ABI (ERC721 + custom functions)
export const IDENTITY_REGISTRY_ABI = [
  // ERC721 standard
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  // Custom functions
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "isAuthorizedOrOwner",
    stateMutability: "view",
    inputs: [
      { name: "spender", type: "address" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getMetadata",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "metadataKey", type: "string" },
    ],
    outputs: [{ type: "bytes" }],
  },
] as const;

// ERC-8004 Reputation Registry ABI
export const REPUTATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "getIdentityRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getLastIndex",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddress", type: "address" },
    ],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "readFeedback",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddress", type: "address" },
      { name: "feedbackIndex", type: "uint64" },
    ],
    outputs: [
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "isRevoked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "getClients",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address[]" }],
  },
] as const;

// Types
export interface IdentityStatus {
  isRegistered: boolean;
  agentId?: bigint;
  tokenURI?: string;
  agentWallet?: Address;
  error?: string;
}

export interface ReputationSummary {
  hasReputation: boolean;
  feedbackCount: bigint;
  summaryValue: bigint;
  summaryDecimals: number;
  formattedScore?: string;
  error?: string;
}

export interface Erc8004Status {
  identity: IdentityStatus;
  reputation: ReputationSummary;
  pulseEligible: boolean;
}

// Cache for RPC client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let publicClient: any | null = null;

function getPublicClient() {
  if (!publicClient && RPC_URL) {
    publicClient = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
    });
  }
  return publicClient;
}

/**
 * Get identity status for an address
 * Checks if the address owns any identity NFTs
 */
export async function getIdentityStatus(address: string): Promise<IdentityStatus> {
  if (!isAddress(address)) {
    return { isRegistered: false, error: "Invalid address" };
  }

  if (!IDENTITY_REGISTRY_ADDRESS || !RPC_URL) {
    return { isRegistered: false, error: "Registry not configured" };
  }

  const client = getPublicClient();
  if (!client) {
    return { isRegistered: false, error: "RPC client not available" };
  }

  try {
    // Check balance of identity NFTs
    const balance = await client.readContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "balanceOf",
      args: [address],
    });

    if (balance === BigInt(0)) {
      return { isRegistered: false };
    }

    // Get the first token owned by this address
    // Note: We can't use tokenOfOwnerByIndex as it's not enumerable
    // We'll try token IDs 1-100 to find one owned by this address
    for (let i = 1; i <= 100; i++) {
      try {
        const owner = await client.readContract({
          address: IDENTITY_REGISTRY_ADDRESS,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "ownerOf",
          args: [BigInt(i)],
        });

        if (owner.toLowerCase() === address.toLowerCase()) {
          // Found the token - get additional info
          const [tokenURI, agentWallet] = await Promise.all([
            client.readContract({
              address: IDENTITY_REGISTRY_ADDRESS,
              abi: IDENTITY_REGISTRY_ABI,
              functionName: "tokenURI",
              args: [BigInt(i)],
            }).catch(() => ""),
            client.readContract({
              address: IDENTITY_REGISTRY_ADDRESS,
              abi: IDENTITY_REGISTRY_ABI,
              functionName: "getAgentWallet",
              args: [BigInt(i)],
            }).catch(() => address), // Fallback to owner if no wallet set
          ]);

          return {
            isRegistered: true,
            agentId: BigInt(i),
            tokenURI,
            agentWallet: agentWallet || address,
          };
        }
      } catch {
        // Token doesn't exist or other error, continue
        continue;
      }
    }

    // Balance > 0 but couldn't find the token (shouldn't happen)
    return { isRegistered: true, error: "Token lookup failed" };
  } catch (error) {
    return {
      isRegistered: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get reputation summary for an agent ID
 */
export async function getReputationForAgent(agentId: bigint): Promise<ReputationSummary> {
  if (!REPUTATION_REGISTRY_ADDRESS || !RPC_URL) {
    return { hasReputation: false, feedbackCount: BigInt(0), summaryValue: BigInt(0), summaryDecimals: 0, error: "Registry not configured" };
  }

  const client = getPublicClient();
  if (!client) {
    return { hasReputation: false, feedbackCount: BigInt(0), summaryValue: BigInt(0), summaryDecimals: 0, error: "RPC client not available" };
  }

  try {
    // Get clients who provided feedback
    const clients = await client.readContract({
      address: REPUTATION_REGISTRY_ADDRESS,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getClients",
      args: [agentId],
    });

    if (clients.length === 0) {
      return {
        hasReputation: false,
        feedbackCount: BigInt(0),
        summaryValue: BigInt(0),
        summaryDecimals: 0,
      };
    }

    // Get summary for all clients, all tags
    const summary = await client.readContract({
      address: REPUTATION_REGISTRY_ADDRESS,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [agentId, clients, "", ""],
    });

    const [count, summaryValue, summaryDecimals] = summary;

    if (count === BigInt(0)) {
      return {
        hasReputation: false,
        feedbackCount: BigInt(0),
        summaryValue: BigInt(0),
        summaryDecimals: 0,
      };
    }

    // Format the score based on decimals
    let formattedScore: string | undefined;
    if (summaryDecimals === 0) {
      formattedScore = summaryValue.toString();
    } else {
      const divisor = BigInt(10 ** summaryDecimals);
      const integerPart = summaryValue / divisor;
      const fractionalPart = summaryValue % divisor;
      formattedScore = `${integerPart}.${fractionalPart.toString().padStart(summaryDecimals, "0")}`;
    }

    return {
      hasReputation: true,
      feedbackCount: count,
      summaryValue,
      summaryDecimals,
      formattedScore,
    };
  } catch (error) {
    return {
      hasReputation: false,
      feedbackCount: BigInt(0),
      summaryValue: BigInt(0),
      summaryDecimals: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get combined ERC-8004 status for an address
 * Combines identity and reputation data
 */
export async function getErc8004Status(address: string): Promise<Erc8004Status> {
  const identity = await getIdentityStatus(address);
  
  // Only query reputation if identity exists
  let reputation: ReputationSummary;
  if (identity.isRegistered && identity.agentId !== undefined) {
    reputation = await getReputationForAgent(identity.agentId);
  } else {
    reputation = {
      hasReputation: false,
      feedbackCount: BigInt(0),
      summaryValue: BigInt(0),
      summaryDecimals: 0,
    };
  }

  // Pulse eligibility = has identity (registered agent)
  const pulseEligible = identity.isRegistered;

  return {
    identity,
    reputation,
    pulseEligible,
  };
}

// Legacy function for backward compatibility
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { value: boolean; expiresAt: number }>();

function readCache(wallet: string) {
  const entry = cache.get(wallet);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(wallet);
    return undefined;
  }
  return entry.value;
}

function writeCache(wallet: string, value: boolean) {
  cache.set(wallet, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Legacy function: Check if wallets have ERC-8004 badges
 * Used by existing pulse feed to show badge indicators
 */
export async function getErc8004Badges(
  wallets: string[]
): Promise<Record<string, boolean>> {
  const identityRegistry = IDENTITY_REGISTRY_ADDRESS;
  if (!identityRegistry || !RPC_URL) return {};

  const uniqueWallets = Array.from(
    new Set(wallets.filter((wallet) => isAddress(wallet)))
  );

  if (uniqueWallets.length === 0) return {};

  const resultMap: Record<string, boolean> = {};
  const toQuery: string[] = [];

  for (const wallet of uniqueWallets) {
    const cached = readCache(wallet);
    if (cached !== undefined) {
      resultMap[wallet] = cached;
    } else {
      toQuery.push(wallet);
    }
  }

  if (toQuery.length === 0) return resultMap;

  const client = getPublicClient();
  if (!client) return resultMap;

  const results = await Promise.all(
    toQuery.map(async (wallet) => {
      try {
        const result = await client.readContract({
          address: identityRegistry,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "balanceOf",
          args: [wallet as Address],
        });
        return { wallet, status: "success" as const, result };
      } catch (error) {
        return { wallet, status: "failure" as const, error };
      }
    })
  );

  results.forEach((entry) => {
    if (entry.status === "success") {
      const resultValue = entry.result as bigint | undefined;
      const hasBadge = (resultValue ?? BigInt(0)) > BigInt(0);
      resultMap[entry.wallet] = hasBadge;
      writeCache(entry.wallet, hasBadge);
    } else {
      resultMap[entry.wallet] = false;
    }
  });

  return resultMap;
}

export default {
  getIdentityStatus,
  getReputationForAgent,
  getErc8004Status,
  getErc8004Badges,
};
