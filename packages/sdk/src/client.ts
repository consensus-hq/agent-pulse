/**
 * Agent Pulse SDK - Client
 * 
 * Main client for interacting with the Agent Pulse protocol.
 * Handles both free on-chain reads and paid API calls via x402.
 * 
 * @module client
 */

import {
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { base, baseSepolia } from "viem/chains";

import {
  type SDKConfig,
  type WalletConfig,
  type AgentStatus,
  type ProtocolConfig,
  type ProtocolHealth,
  type PulseParams,
  type PulseResponse,
  type ReliabilityScore,
  type LivenessProof,
  type GlobalStats,
  type PeerCorrelation,
  AgentPulseError,
  DEFAULTS,
  ENDPOINT_PRICES,
} from "./types.js";

import {
  signX402Payment,
  encodeX402PaymentHeader,
} from "./x402.js";

import { AttestationModule } from "./attestation.js";

// ============================================================================
// Contract ABIs (minimal for functionality)
// ============================================================================

const PULSE_REGISTRY_ABI = [
  {
    inputs: [{ name: "agent", type: "address" }],
    name: "isAlive",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "agent", type: "address" }],
    name: "getAgentStatus",
    outputs: [
      { name: "alive", type: "bool" },
      { name: "lastPulseAt", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "hazardScore", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "agents",
    outputs: [
      { name: "lastPulseAt", type: "uint64" },
      { name: "streak", type: "uint32" },
      { name: "lastStreakDay", type: "uint32" },
      { name: "hazardScore", type: "uint8" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "pulse",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "amount", type: "uint256" }],
    name: "pulse",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "ttlSeconds",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "minPulseAmount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "paused",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const PULSE_TOKEN_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ============================================================================
// AgentPulseClient
// ============================================================================

export interface AgentPulseClientConfig extends SDKConfig {
  /** Wallet configuration for transactions */
  wallet?: WalletConfig;
}

/**
 * Agent Pulse Client
 * 
 * Main client for interacting with the Agent Pulse protocol.
 * 
 * @example
 * ```typescript
 * const client = new AgentPulseClient({
 *   wallet: {
 *     address: "0x...",
 *     signMessage: async (msg) => signer.signMessage(msg),
 *   },
 * });
 * 
 * // Check if alive (free)
 * const alive = await client.isAlive("0x...");
 * 
 * // Send pulse (paid - requires PULSE tokens)
 * const result = await client.pulse();
 * 
 * // Get reliability (paid API - requires x402 USDC payment)
 * const reliability = await client.getReliability("0x...");
 * ```
 */
export class AgentPulseClient {
  private config: Required<Pick<SDKConfig, "baseUrl" | "chainId">> &
    AgentPulseClientConfig;
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private pulseToken: Address;
  private pulseRegistry: Address;
  public attestation: AttestationModule;

  constructor(config: AgentPulseClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? DEFAULTS.BASE_URL,
      chainId: config.chainId ?? DEFAULTS.CHAIN_ID,
      ...config,
    };

    this.pulseToken = config.contracts?.pulseToken ?? DEFAULTS.PULSE_TOKEN;
    this.pulseRegistry = config.contracts?.pulseRegistry ?? DEFAULTS.PULSE_REGISTRY;

    // Select chain based on configured chainId (Base mainnet by default)
    const chain: Chain = this.config.chainId === 84532 ? baseSepolia : base;
    const transport = config.rpcUrl ? http(config.rpcUrl) : http();

    // Create public client for reading from chain
    this.publicClient = createPublicClient({ chain, transport });

    // Create wallet client if private key provided
    if (config.wallet?.privateKey) {
      this.walletClient = createWalletClient({
        chain,
        transport,
        account: config.wallet.address,
      });
    }

    this.attestation = new AttestationModule(this);
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Get the client's configuration
   */
  getConfig(): AgentPulseClientConfig {
    return { ...this.config };
  }

  /**
   * Get contract addresses
   */
  getContracts(): { pulseToken: Address; pulseRegistry: Address } {
    return {
      pulseToken: this.pulseToken,
      pulseRegistry: this.pulseRegistry,
    };
  }

  // ==========================================================================
  // On-Chain Read Operations (Free)
  // ==========================================================================

  /**
   * Check if an agent is alive (free on-chain read)
   * 
   * @param address - Agent address to check
   * @returns True if agent is within TTL
   */
  async isAlive(address: Address): Promise<boolean> {
    try {
      const result = await this.publicClient.readContract({
        address: this.pulseRegistry,
        abi: PULSE_REGISTRY_ABI,
        functionName: "isAlive",
        args: [address],
      });
      return result;
    } catch (error) {
      throw new AgentPulseError(
        `Failed to check if agent is alive: ${error instanceof Error ? error.message : String(error)}`,
        "NETWORK_ERROR",
        undefined,
        error
      );
    }
  }

  /**
   * Get full agent status from the contract (free on-chain read)
   * 
   * @param address - Agent address
   * @returns Full agent status
   */
  async getAgentStatus(address: Address): Promise<AgentStatus> {
    try {
      const [alive, lastPulseAt, streak, hazardScore] = await this.publicClient.readContract({
        address: this.pulseRegistry,
        abi: PULSE_REGISTRY_ABI,
        functionName: "getAgentStatus",
        args: [address],
      });

      const ttlSeconds = await this.publicClient.readContract({
        address: this.pulseRegistry,
        abi: PULSE_REGISTRY_ABI,
        functionName: "ttlSeconds",
      });

      return {
        alive,
        lastPulse: Number(lastPulseAt),
        streak: Number(streak),
        hazardScore: Number(hazardScore),
        ttlSeconds: Number(ttlSeconds),
      };
    } catch (error) {
      throw new AgentPulseError(
        `Failed to get agent status: ${error instanceof Error ? error.message : String(error)}`,
        "NETWORK_ERROR",
        undefined,
        error
      );
    }
  }

  /**
   * Get protocol configuration (free API call)
   */
  async getProtocolConfig(): Promise<ProtocolConfig> {
    const response = await fetch(`${this.config.baseUrl}/api/config`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new AgentPulseError(
        `Failed to get protocol config: ${response.statusText}`,
        "API_ERROR",
        response.status
      );
    }

    return response.json() as Promise<ProtocolConfig>;
  }

  /**
   * Get protocol health status (free API call)
   */
  async getProtocolHealth(): Promise<ProtocolHealth> {
    const response = await fetch(`${this.config.baseUrl}/api/protocol-health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new AgentPulseError(
        `Failed to get protocol health: ${response.statusText}`,
        "API_ERROR",
        response.status
      );
    }

    return response.json() as Promise<ProtocolHealth>;
  }

  // ==========================================================================
  // On-Chain Write Operations (Requires PULSE tokens + Gas)
  // ==========================================================================

  /**
   * Send a pulse transaction (burns PULSE tokens)
   * 
   * This is an on-chain transaction that requires:
   * - PULSE token balance
   * - ERC20 approval for PulseRegistry
   * - Gas for the transaction
   * 
   * @param params - Pulse parameters
   * @returns Pulse response with transaction hash
   */
  async pulse(params: PulseParams = {}): Promise<PulseResponse> {
    if (!this.walletClient || !this.config.wallet) {
      throw new AgentPulseError(
        "Wallet not configured. Provide a wallet config with address and privateKey.",
        "NOT_IMPLEMENTED"
      );
    }

    const amount = params.amount ?? DEFAULTS.DEFAULT_PULSE_AMOUNT;
    const amountBigInt = typeof amount === "string" ? BigInt(amount) : amount;

    try {
      // Check current allowance
      const allowance = await this.publicClient.readContract({
        address: this.pulseToken,
        abi: PULSE_TOKEN_ABI,
        functionName: "allowance",
        args: [this.config.wallet.address, this.pulseRegistry],
      });

      // Approve if needed
      if (allowance < amountBigInt) {
        const writeChain: Chain = this.config.chainId === 84532 ? baseSepolia : base;

        const approveHash = await this.walletClient.writeContract({
          address: this.pulseToken,
          abi: PULSE_TOKEN_ABI,
          functionName: "approve",
          args: [this.pulseRegistry, amountBigInt * 10n], // Approve 10x for future pulses
          account: this.config.wallet.address,
          chain: writeChain,
        });

        // Wait for approval to be mined
        await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Send pulse
      const writeChainForPulse: Chain = this.config.chainId === 84532 ? baseSepolia : base;
      const txHash = await this.walletClient.writeContract({
        address: this.pulseRegistry,
        abi: PULSE_REGISTRY_ABI,
        functionName: "pulse",
        args: [amountBigInt],
        account: this.config.wallet.address,
        chain: writeChainForPulse,
      });

      // Wait for receipt
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status !== "success") {
        throw new AgentPulseError("Pulse transaction failed", "TRANSACTION_FAILED");
      }

      // Get updated streak
      const status = await this.getAgentStatus(this.config.wallet.address);

      return {
        success: true,
        txHash,
        streak: status.streak,
      };
    } catch (error) {
      if (error instanceof AgentPulseError) {
        throw error;
      }
      throw new AgentPulseError(
        `Failed to send pulse: ${error instanceof Error ? error.message : String(error)}`,
        "TRANSACTION_FAILED",
        undefined,
        error
      );
    }
  }

  // ==========================================================================
  // Paid API Operations (Requires x402 USDC Payment)
  // ==========================================================================

  /**
   * Make a paid API call with x402 payment
   * 
   * @param endpoint - API endpoint path
   * @param price - Price for the endpoint
   * @param options - Request options
   * @returns API response
   */
  private async paidApiCall<T>(
    endpoint: string,
    price: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.config.wallet) {
      throw new AgentPulseError(
        "Wallet not configured. Required for paid API calls.",
        "NOT_IMPLEMENTED"
      );
    }

    // Get server wallet address from config or use default
    const serverWallet = this.config.x402?.serverWalletAddress;
    if (!serverWallet) {
      throw new AgentPulseError(
        "Server wallet address not configured. Set x402.serverWalletAddress in config.",
        "NOT_IMPLEMENTED"
      );
    }

    // First attempt - may get 402
    const url = `${this.config.baseUrl}${endpoint}`;
    const firstResponse = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });

    // If not 402, return result
    if (firstResponse.status !== 402) {
      if (!firstResponse.ok) {
        throw new AgentPulseError(
          `API error: ${firstResponse.statusText}`,
          "API_ERROR",
          firstResponse.status
        );
      }
      return firstResponse.json() as Promise<T>;
    }

    // Need to pay - create authorization
    const signFn = this.config.wallet.signMessage || this.config.wallet.signTypedData;
    if (!signFn) {
      throw new AgentPulseError(
        "Signer not configured. Provide signMessage or signTypedData in wallet config.",
        "NOT_IMPLEMENTED"
      );
    }

    const authorization = await signX402Payment({
      from: this.config.wallet.address,
      to: serverWallet,
      price,
      sign: async (hash) => {
        if (this.config.wallet?.signMessage) {
          return this.config.wallet.signMessage(hash);
        }
        // Fallback to typed data signing
        throw new AgentPulseError("signMessage required for x402 payments", "NOT_IMPLEMENTED");
      },
    });

    const paymentHeader = encodeX402PaymentHeader(authorization);

    // Second attempt with payment
    const secondResponse = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        "x-payment": paymentHeader,
        ...options.headers,
      },
    });

    if (!secondResponse.ok) {
      throw new AgentPulseError(
        `Paid API error: ${secondResponse.statusText}`,
        "API_ERROR",
        secondResponse.status
      );
    }

    return secondResponse.json() as Promise<T>;
  }

  /**
   * Get reliability score for an agent (paid API - $0.01)
   * 
   * @param address - Agent address
   * @returns Reliability score data
   */
  async getReliability(address: Address): Promise<ReliabilityScore> {
    return this.paidApiCall<ReliabilityScore>(
      `/api/paid/reliability?address=${address}`,
      ENDPOINT_PRICES.RELIABILITY
    );
  }

  /**
   * Get liveness proof for an agent (paid API - $0.005)
   * 
   * @param address - Agent address
   * @returns Liveness proof
   */
  async getLivenessProof(address: Address): Promise<LivenessProof> {
    return this.paidApiCall<LivenessProof>(
      `/api/paid/liveness-proof?address=${address}`,
      ENDPOINT_PRICES.LIVENESS_PROOF
    );
  }

  /**
   * Get global protocol statistics (paid API - $0.03)
   * 
   * @returns Global stats
   */
  async getGlobalStats(): Promise<GlobalStats> {
    return this.paidApiCall<GlobalStats>(
      `/api/paid/global-stats`,
      ENDPOINT_PRICES.GLOBAL_STATS
    );
  }

  /**
   * Get peer correlation for an agent (paid API - $0.02)
   * 
   * @param address - Agent address
   * @returns Peer correlation data
   */
  async getPeerCorrelation(address: Address): Promise<PeerCorrelation> {
    return this.paidApiCall<PeerCorrelation>(
      `/api/paid/peer-correlation?address=${address}`,
      ENDPOINT_PRICES.PEER_CORRELATION
    );
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get PULSE token balance for an address
   * @param address - Address to check (defaults to wallet address)
   */
  async getBalance(address?: Address): Promise<bigint> {
    const addr = address || this.config.wallet?.address;
    if (!addr) {
      throw new AgentPulseError("No address provided", "INVALID_ADDRESS");
    }

    return this.publicClient.readContract({
      address: this.pulseToken,
      abi: PULSE_TOKEN_ABI,
      functionName: "balanceOf",
      args: [addr],
    });
  }

  /**
   * Get allowance for PulseRegistry
   * @param owner - Token owner address
   */
  async getAllowance(owner?: Address): Promise<bigint> {
    const addr = owner || this.config.wallet?.address;
    if (!addr) {
      throw new AgentPulseError("No address provided", "INVALID_ADDRESS");
    }

    return this.publicClient.readContract({
      address: this.pulseToken,
      abi: PULSE_TOKEN_ABI,
      functionName: "allowance",
      args: [addr, this.pulseRegistry],
    });
  }
}

// Export for convenience
export { AgentPulseClient as default };
