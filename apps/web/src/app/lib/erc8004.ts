import { createPublicClient, http, isAddress } from "viem";
import { base } from "viem/chains";

const ERC721_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const identityRegistry =
  process.env.NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY_ADDRESS as
    | `0x${string}`
    | undefined;
const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL;

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

export async function getErc8004Badges(
  wallets: string[]
): Promise<Record<string, boolean>> {
  if (!identityRegistry || !rpcUrl) return {};

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

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const contracts = toQuery.map((wallet) => ({
    address: identityRegistry as `0x${string}`,
    abi: ERC721_ABI,
    functionName: "balanceOf" as const,
    args: [wallet as `0x${string}`] as const,
  }));

  const results = await Promise.all(
    contracts.map(async (contract) => {
      try {
        const result = await publicClient.readContract(contract);
        return { status: "success", result } as const;
      } catch (error) {
        return { status: "failure", error } as const;
      }
    })
  );

  results.forEach((entry, index) => {
    const wallet = toQuery[index];
    if (entry.status === "success") {
      const hasBadge = (entry.result ?? BigInt(0)) > BigInt(0);
      resultMap[wallet] = hasBadge;
      writeCache(wallet, hasBadge);
    } else {
      resultMap[wallet] = false;
    }
  });

  return resultMap;
}
