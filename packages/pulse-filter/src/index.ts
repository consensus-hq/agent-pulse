import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { baseSepolia } from 'viem/chains';

// PulseRegistry ABI (minimal for read operations)
const PULSE_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'isAlive',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentStatus',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [
      { name: 'alive', type: 'bool' },
      { name: 'lastPulseAt', type: 'uint256' },
      { name: 'streak', type: 'uint256' },
      { name: 'hazardScore', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ttlSeconds',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export type AgentStatus = {
  address: Address;
  alive: boolean;
  lastPulseAt: bigint;
  streak: bigint;
  hazardScore: bigint;
};

export type FilterOptions = {
  /** Time threshold in seconds - agents older than this are filtered out */
  threshold: number;
  /** PulseRegistry contract address */
  registryAddress: Address;
  /** RPC URL for the blockchain */
  rpcUrl: string;
  /** Optional custom chain (defaults to baseSepolia) */
  chain?: typeof baseSepolia;
};

export type FilterResult = {
  /** Addresses that are alive and within threshold */
  alive: Address[];
  /** Detailed status for all queried agents */
  details: AgentStatus[];
  /** Addresses that failed validation */
  errors: Array<{ address: Address; reason: string }>;
  /** Current timestamp used for filtering */
  timestamp: number;
};

/**
 * Validates Ethereum address format
 */
function isValidAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Batch filter agents to return only those that are alive
 * and have pulsed within the specified threshold
 */
export async function filterAlive(
  agents: Address[],
  options: FilterOptions
): Promise<FilterResult> {
  const { threshold, registryAddress, rpcUrl, chain = baseSepolia } = options;

  // Create viem public client
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const errors: Array<{ address: Address; reason: string }> = [];
  const validAgents: Address[] = [];

  // Validate addresses first
  for (const agent of agents) {
    if (!isValidAddress(agent)) {
      errors.push({ address: agent as Address, reason: 'Invalid address format' });
    } else {
      validAgents.push(agent);
    }
  }

  if (validAgents.length === 0) {
    return {
      alive: [],
      details: [],
      errors,
      timestamp,
    };
  }

  // Batch call getAgentStatus for all valid agents
  const statusPromises = validAgents.map(async (agent) => {
    try {
      const [alive, lastPulseAt, streak, hazardScore] = await client.readContract({
        address: registryAddress,
        abi: PULSE_REGISTRY_ABI,
        functionName: 'getAgentStatus',
        args: [agent],
      });

      return {
        address: agent,
        alive,
        lastPulseAt,
        streak,
        hazardScore,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ address: agent, reason: `Contract call failed: ${message}` });
      return null;
    }
  });

  const statuses = (await Promise.all(statusPromises)).filter(
    (s): s is AgentStatus => s !== null
  );

  // Filter agents that are alive and within threshold
  const aliveAddresses = statuses
    .filter((status) => {
      if (!status.alive) return false;
      const secondsSincePulse = timestamp - Number(status.lastPulseAt);
      return secondsSincePulse <= threshold;
    })
    .map((status) => status.address);

  return {
    alive: aliveAddresses,
    details: statuses,
    errors,
    timestamp,
  };
}

/**
 * Check if a single agent is alive without threshold filtering
 */
export async function isAgentAlive(
  agent: Address,
  options: Omit<FilterOptions, 'threshold'>
): Promise<{ alive: boolean; lastPulseAt: bigint; streak: bigint; hazardScore: bigint }> {
  const { registryAddress, rpcUrl, chain = baseSepolia } = options;

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const [alive, lastPulseAt, streak, hazardScore] = await client.readContract({
    address: registryAddress,
    abi: PULSE_REGISTRY_ABI,
    functionName: 'getAgentStatus',
    args: [agent],
  });

  return { alive, lastPulseAt, streak, hazardScore };
}

/**
 * Get the TTL (time-to-live) configured in the registry
 */
export async function getRegistryTTL(
  options: Omit<FilterOptions, 'threshold'>
): Promise<bigint> {
  const { registryAddress, rpcUrl, chain = baseSepolia } = options;

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const ttl = await client.readContract({
    address: registryAddress,
    abi: PULSE_REGISTRY_ABI,
    functionName: 'ttlSeconds',
  });

  return ttl;
}

export { PULSE_REGISTRY_ABI };
export type { Address, PublicClient };
