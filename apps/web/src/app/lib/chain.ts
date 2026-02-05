import { createThirdwebClient, getContract, readContract } from "thirdweb";
import { baseSepolia, base } from "thirdweb/chains";

// Environment configuration
const THIRDWEB_CLIENT_ID = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;
const PULSE_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS?.toLowerCase()) as `0x${string}` | undefined;
const CHAIN_ID = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID;

// Single client instance for edge runtime
let _client: ReturnType<typeof createThirdwebClient> | null = null;

/**
 * Get or create the thirdweb client
 */
export function getThirdwebClient(): ReturnType<typeof createThirdwebClient> | null {
  if (!_client) {
    if (!THIRDWEB_CLIENT_ID && !THIRDWEB_SECRET_KEY) {
      return null;
    }

    _client = createThirdwebClient({
      clientId: THIRDWEB_CLIENT_ID || "",
      secretKey: THIRDWEB_SECRET_KEY,
    });
  }
  return _client;
}

/**
 * Get the appropriate chain configuration
 */
export function getChain() {
  return CHAIN_ID === "84532" ? baseSepolia : base;
}

/**
 * Get the PulseRegistry contract instance
 */
export function getRegistryContract() {
  const client = getThirdwebClient();
  if (!client || !PULSE_REGISTRY_ADDRESS) {
    return null;
  }

  return getContract({
    client,
    chain: getChain(),
    address: PULSE_REGISTRY_ADDRESS,
  });
}

// PulseRegistry ABI functions (as strings for thirdweb)
const ABI_IS_ALIVE = "function isAlive(address agent) view returns (bool)";
const ABI_GET_AGENT_STATUS = "function getAgentStatus(address agent) view returns (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore)";
const ABI_TTL_SECONDS = "function ttlSeconds() view returns (uint256)";
const ABI_PAUSED = "function paused() view returns (bool)";
const ABI_MIN_PULSE_AMOUNT = "function minPulseAmount() view returns (uint256)";
// Note: totalAgents() does not exist on the deployed PulseRegistry contract.
// Agent count is derived from Insight API events instead.
const ABI_LAST_PULSE_AT = "function lastPulseAt(address agent) view returns (uint256)";

export interface AgentStatus {
  alive: boolean;
  lastPulseAt: bigint;
  streak: bigint;
  hazardScore: bigint;
}

/**
 * Read full agent status from chain via thirdweb SDK
 */
export async function readAgentStatus(agentAddress: string): Promise<AgentStatus | null> {
  const contract = getRegistryContract();
  if (!contract) {
    return null;
  }

  try {
    const result = await readContract({
      contract,
      method: ABI_GET_AGENT_STATUS,
      params: [agentAddress],
    });

    return {
      alive: result[0],
      lastPulseAt: result[1],
      streak: result[2],
      hazardScore: result[3],
    };
  } catch (error) {
    console.error("Failed to read agent status:", error);
    return null;
  }
}

/**
 * Read isAlive for a specific agent
 */
export async function readIsAlive(agentAddress: string): Promise<boolean | null> {
  const contract = getRegistryContract();
  if (!contract) {
    return null;
  }

  try {
    return await readContract({
      contract,
      method: ABI_IS_ALIVE,
      params: [agentAddress],
    });
  } catch (error) {
    console.error("Failed to read isAlive:", error);
    return null;
  }
}

/**
 * Read lastPulseAt for a specific agent
 */
export async function readLastPulseAt(agentAddress: string): Promise<bigint | null> {
  const contract = getRegistryContract();
  if (!contract) {
    return null;
  }

  try {
    return await readContract({
      contract,
      method: ABI_LAST_PULSE_AT,
      params: [agentAddress],
    });
  } catch (error) {
    console.error("Failed to read lastPulseAt:", error);
    return null;
  }
}

/**
 * Read protocol TTL (time-to-live) in seconds
 */
export async function readTTL(): Promise<bigint | null> {
  const contract = getRegistryContract();
  if (!contract) {
    return null;
  }

  try {
    return await readContract({
      contract,
      method: ABI_TTL_SECONDS,
      params: [],
    });
  } catch (error) {
    console.error("Failed to read TTL:", error);
    return null;
  }
}

/**
 * Read contract pause state
 */
export async function readPauseState(): Promise<boolean | null> {
  const contract = getRegistryContract();
  if (!contract) {
    return null;
  }

  try {
    return await readContract({
      contract,
      method: ABI_PAUSED,
      params: [],
    });
  } catch (error) {
    console.error("Failed to read pause state:", error);
    return null;
  }
}

/**
 * Read minimum pulse amount
 */
export async function readMinPulseAmount(): Promise<bigint | null> {
  const contract = getRegistryContract();
  if (!contract) {
    return null;
  }

  try {
    return await readContract({
      contract,
      method: ABI_MIN_PULSE_AMOUNT,
      params: [],
    });
  } catch (error) {
    console.error("Failed to read min pulse amount:", error);
    return null;
  }
}

// readTotalAgents removed — totalAgents() does not exist on deployed PulseRegistry.
// Agent count is derived from Insight API pulse events in protocol-health route.

/**
 * Reset the client (useful for testing)
 */
export function resetClient(): void {
  _client = null;
}
