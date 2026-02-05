import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBaseClient(): any {
  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) return null;
  
  if (!_client) {
    const chainId = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID;
    const chain = chainId === "84532" ? baseSepolia : base;
    
    _client = createPublicClient({
      chain,
      transport: http(rpcUrl, { timeout: 10_000, retryCount: 2 }),
    });
  }
  return _client;
}

export function resetClient(): void {
  _client = null;
}
