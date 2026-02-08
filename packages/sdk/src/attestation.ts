/**
 * Agent Pulse SDK - Attestation
 * 
 * Core methods for peer-to-peer attestation and reputation tracking.
 * 
 * @module attestation
 */

import { type Address, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { AgentPulseClient } from "./client.js";
import {
  type AttestationOutcome,
  type AttestOptions,
  type AttestResponse,
  type Reputation,
  type AttestationList,
  type GetAttestationsOptions,
  type WithAttestationOptions,
  AgentPulseError,
  ENDPOINT_PRICES,
  DEFAULTS,
} from "./types.js";

/**
 * Peer Attestation Contract ABI
 */
const PEER_ATTESTATION_ABI = [
  {
    inputs: [
      { name: "agent", type: "address" },
      { name: "positive", type: "bool" },
    ],
    name: "attest",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Peer Attestation Extension for AgentPulseClient
 */
export class AttestationModule {
  private client: AgentPulseClient;
  private peerAttestation: Address;

  constructor(client: AgentPulseClient) {
    this.client = client;
    // Assume the contract address is passed in or uses a default
    const contracts = client.getContracts() as any;
    this.peerAttestation = contracts.peerAttestation ?? "0x63351336eC1fB918E8c094406085f1c548F566f1"; // Default for Base Sepolia
  }

  /**
   * Submit an attestation for another agent
   * 
   * This is an on-chain transaction.
   * 
   * @param address - Agent address to attest
   * @param outcome - Result of the interaction
   * @param opts - Additional options
   * @returns Typed response with tx hash and new composite score
   */
  async attest(
    address: Address,
    outcome: AttestationOutcome,
    _opts: AttestOptions = {}
  ): Promise<AttestResponse> {
    const config = this.client.getConfig();
    if (!config.wallet || !config.wallet.address) {
      throw new AgentPulseError("Wallet not configured", "NOT_IMPLEMENTED");
    }

    const publicClient = (this.client as any).publicClient;
    const walletClient = (this.client as any).walletClient;

    if (!walletClient) {
      throw new AgentPulseError("Wallet client not available", "NOT_IMPLEMENTED");
    }

    // Map outcome to boolean for contract
    // success = true, failure/timeout = false
    const positive = outcome === "success";

    try {
      // 1. Submit on-chain transaction
      const txHash = await walletClient.writeContract({
        address: this.peerAttestation,
        abi: PEER_ATTESTATION_ABI,
        functionName: "attest",
        args: [address, positive],
        account: config.wallet.address,
        chain: ((config as any).chainId === 84532 ? baseSepolia : base) as Chain,
      });

      // 2. Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // 3. Fetch updated reputation from API to return new score
      // Note: We use the client's internal paidApiCall if possible
      const reputation = await this.getReputation(address);

      return {
        success: true,
        txHash,
        subject: address,
        outcome,
        newScore: reputation.composite.score,
      };
    } catch (error) {
      if (error instanceof AgentPulseError) throw error;
      throw new AgentPulseError(
        `Attestation failed: ${error instanceof Error ? error.message : String(error)}`,
        "TRANSACTION_FAILED",
        undefined,
        error
      );
    }
  }

  /**
   * Get the full reputation data for an agent (paid API)
   * 
   * @param address - Agent address
   * @returns Detailed reputation metrics
   */
  async getReputation(address: Address): Promise<Reputation> {
    return (this.client as any).paidApiCall(
      `/api/paid/reputation?address=${address}`,
      ENDPOINT_PRICES.REPUTATION
    );
  }

  /**
   * Get a paginated list of attestations for an agent (paid API)
   * 
   * @param address - Agent address
   * @param opts - Filter and pagination options
   * @returns List of attestation records
   */
  async getAttestations(
    address: Address,
    opts: GetAttestationsOptions = {}
  ): Promise<AttestationList> {
    const params = new URLSearchParams();
    params.append("address", address);
    if (opts.limit) params.append("limit", opts.limit.toString());
    if (opts.offset) params.append("offset", opts.offset.toString());
    if (opts.outcome) params.append("outcome", opts.outcome);
    if (opts.since) params.append("since", opts.since.toString());

    return (this.client as any).paidApiCall(
      `/api/paid/attestations?${params.toString()}`,
      ENDPOINT_PRICES.ATTESTATIONS
    );
  }

  /**
   * Wrap an async operation with automatic attestation
   * 
   * @param address - Agent address being interacted with
   * @param work - Async function to execute
   * @param opts - Attestation and timeout options
   * @returns Result of the work
   */
  async withAttestation<T>(
    address: Address,
    work: () => Promise<T>,
    opts: WithAttestationOptions = {}
  ): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? DEFAULTS.TIMEOUT_MS;
    
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new AgentPulseError(`Operation timed out after ${timeoutMs}ms`, "TIMEOUT"));
      }, timeoutMs);
    });

    try {
      // Race the work against the timeout
      const result = await Promise.race([work(), timeoutPromise]);
      
      // If we got here, it succeeded
      // We attest in the background or wait? Let's wait to ensure it's recorded
      await this.attest(address, "success", opts);
      
      return result;
    } catch (error) {
      // Determine if it was a timeout or a normal failure
      const outcome: AttestationOutcome = (error instanceof AgentPulseError && error.code === "TIMEOUT")
        ? "timeout"
        : "failure";
      
      // Record failure/timeout
      await this.attest(address, outcome, opts);
      
      // Re-throw the original error
      throw error;
    }
  }
}
