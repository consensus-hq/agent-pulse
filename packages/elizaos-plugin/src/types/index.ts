/**
 * Type Exports
 *
 * Central export point for all Pulse Gate types.
 * @module types
 */

// Re-export gate types
export type {
  GateMode,
  GateConfig,
  PulseGateSettings,
  GateCheckResult,
  GateDecision,
  ExtractedIdentity,
  GateState,
  GateCacheEntry,
} from "./gate.js";

// Re-export existing types from root pulseTypes.ts
export type {
  AgentStatus,
  ContractAgentStatus,
  ProtocolConfig,
  ProtocolHealth,
  SendPulseParams,
  PulseResponse,
  PulsePluginState,
  PulseMemory,
  ApiResponse,
  ReliabilityMetrics,
  LivenessProof,
  GlobalStats,
  PeerCorrelation,
} from "../pulseTypes.js";
