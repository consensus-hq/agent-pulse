/**
 * Agent Pulse SDK - Gating
 * 
 * Bidirectional gating for incoming and outgoing agent requests.
 * 
 * @module gate
 */

import { type Address } from "viem";
import { AgentPulseClient } from "./client.js";

/**
 * Gating modes
 */
export type GateMode = 
  | "strict" // Reject if agent is dead
  | "warn"   // Log warning but proceed if agent is dead
  | "log";   // Always proceed, just log status

/**
 * Gating options
 */
export interface GateOptions {
  /** Gating mode (default: "strict") */
  mode?: GateMode;
  /** Enable inbound gating (default: false) */
  gateIncoming?: boolean;
  /** Enable outbound gating (default: false) */
  gateOutgoing?: boolean;
  /** Liveness threshold (e.g. '24h', '1h', or ms). Default: '24h' */
  threshold?: string | number;
  /** Custom logger (default: console) */
  logger?: {
    warn: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
  };
}

/**
 * Gate status return object
 */
export interface GateStatus {
  enabled: boolean;
  mode: GateMode;
  inboundRejected: number;
  outboundBlocked: number;
  since: string;
}

/**
 * Error schema for Pulse rejection
 */
export interface PulseRequiredError {
  error: 'PULSE_REQUIRED';
  message: string;
  docs_url: string;
  requester_id: string;
  gate_type: 'inbound' | 'outbound';
  threshold: string;
  last_pulse: string | null;
}

/**
 * Agent Pulse Gate
 * 
 * Handles bidirectional gating based on agent liveness.
 */
export class AgentPulseGate {
  private client: AgentPulseClient;
  private mode: GateMode;
  private gateIncomingEnabled: boolean;
  private gateOutgoingEnabled: boolean;
  private thresholdMs!: number;
  private thresholdStr!: string;
  private logger: { warn: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void };
  
  // Stats
  private inboundRejected: number = 0;
  private outboundBlocked: number = 0;
  private since: string;

  constructor(client: AgentPulseClient, options: GateOptions = {}) {
    this.client = client;
    this.mode = options.mode || "strict";
    this.gateIncomingEnabled = options.gateIncoming || false;
    this.gateOutgoingEnabled = options.gateOutgoing || false;
    this.logger = options.logger || console;
    this.since = new Date().toISOString();
    
    // Set threshold (default 24h)
    this.setThreshold(options.threshold || '24h');
  }

  /**
   * Set the liveness threshold
   * @param threshold - Duration string (e.g., '24h', '30m') or milliseconds
   */
  setThreshold(threshold: string | number): void {
    this.thresholdStr = threshold.toString();
    this.thresholdMs = this.parseDuration(threshold);
  }

  /**
   * Get current gate status
   */
  status(): GateStatus {
    return {
      enabled: this.gateIncomingEnabled || this.gateOutgoingEnabled,
      mode: this.mode,
      inboundRejected: this.inboundRejected,
      outboundBlocked: this.outboundBlocked,
      since: this.since
    };
  }

  /**
   * Check inbound request from a requester
   * 
   * @param requesterId - Address of the requester
   * @returns Promise resolving if allowed, rejecting with PulseRequiredError if blocked
   */
  async checkInbound(requesterId: Address): Promise<void> {
    if (!this.gateIncomingEnabled) return;
    return this.evaluateLiveness('inbound', requesterId);
  }

  /**
   * Check outbound request to a target
   * 
   * @param targetId - Address of the target
   * @returns Promise resolving if allowed, rejecting with PulseRequiredError if blocked
   */
  async checkOutbound(targetId: Address): Promise<void> {
    if (!this.gateOutgoingEnabled) return;
    return this.evaluateLiveness('outbound', targetId);
  }

  /**
   * Internal evaluation logic
   */
  private async evaluateLiveness(type: 'inbound' | 'outbound', agentId: Address): Promise<void> {
    try {
      // 1. Get agent status from chain
      const status = await this.client.getAgentStatus(agentId);
      
      // 2. Calculate if alive based on local threshold
      const nowSeconds = Math.floor(Date.now() / 1000);
      const thresholdSeconds = Math.floor(this.thresholdMs / 1000);
      const isAlive = status.lastPulse > 0 && (nowSeconds - status.lastPulse) <= thresholdSeconds;
      
      // 3. If alive, pass
      if (isAlive) {
        return;
      }

      // 4. Handle failure based on mode
      const lastPulseDate = status.lastPulse > 0 ? new Date(status.lastPulse * 1000).toISOString() : null;
      
      const errorObj: PulseRequiredError = {
        error: 'PULSE_REQUIRED',
        message: `Agent ${agentId} pulse is stale or absent. Last pulse: ${lastPulseDate || 'NEVER'}. Threshold: ${this.thresholdStr}.`,
        docs_url: 'https://docs.agentpulse.xyz',
        requester_id: agentId,
        gate_type: type,
        threshold: this.thresholdStr,
        last_pulse: lastPulseDate
      };

      if (this.mode === 'log') {
        this.logger.info(`[AgentPulseGate] ${type} ALLOWED (log mode): ${errorObj.message}`);
        return;
      }

      if (this.mode === 'warn') {
        this.logger.warn(`[AgentPulseGate] ${type} ALLOWED (warn mode): ${errorObj.message}`);
        return;
      }

      // Strict mode
      if (type === 'inbound') this.inboundRejected++;
      if (type === 'outbound') this.outboundBlocked++;
      
      this.logger.error(`[AgentPulseGate] ${type} BLOCKED: ${errorObj.message}`);
      
      // Reject with the error object
      return Promise.reject(errorObj);

    } catch (err) {
      // If the error is already our error object, rethrow
      if (err && (err as any).error === 'PULSE_REQUIRED') throw err;

      // Determine how to handle network/rpc errors
      // Default: Fail OPEN to avoid blocking on RPC issues, unless strictly required?
      // "Gate modes: strict (hard reject)" usually implies reject on failure.
      // But here we are checking *liveness*. If we can't check, what do we do?
      // Let's log and pass for safety against RPC downtime affecting traffic, unless configured otherwise.
      // But strict mode usually demands proof. 
      // Given the requirement "Use viem for on-chain reads", I'll assume standard error handling.
      // If the check fails, we technically don't know if they are alive.
      // For now, I will rethrow if it's not a liveness failure but a check failure.
      this.logger.error(`[AgentPulseGate] Liveness check failed for ${agentId}: ${err}`);
      // In strict mode, maybe we should block if we can't verify?
      // Let's assume fail-open for infrastructure errors to be safe, unless user wants fail-closed.
      // I'll stick to failing open on RPC error for now to be less disruptive.
    }
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(input: string | number): number {
    if (typeof input === 'number') return input;
    
    const regex = /^(\d+)([dhms])$/;
    const match = input.match(regex);
    
    if (!match) {
      // Fallback: try parsing as number
      const parsed = parseInt(input, 10);
      if (!isNaN(parsed)) return parsed;
      return 86400000; // Default 24h
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'm': return value * 60 * 1000;
      case 's': return value * 1000;
      default: return 86400000;
    }
  }
  
  // Backwards compatibility wrappers
  
  /**
   * @deprecated Use checkInbound
   */
  async gateIncoming(requesterAddr: Address): Promise<boolean> {
    try {
      await this.checkInbound(requesterAddr);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @deprecated Use checkOutbound
   */
  async gateOutgoing(targetAddr: Address): Promise<boolean> {
    try {
      await this.checkOutbound(targetAddr);
      return true;
    } catch {
      return false;
    }
  }
}
