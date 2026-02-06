export const IndexerKeys = {
  // Global sets
  ALL_AGENTS: 'pulse:agents:all', // Set<AgentAddress>
  ACTIVE_AGENTS_24H: 'pulse:agents:active_24h', // Set<AgentAddress>

  // Per-agent Hash
  // Fields: lastPulse, streak, streakStart, reliability, totalBurns, jitter, hazard, velocity
  AGENT_STATS: (address: string) => `pulse:agent:${address}:stats`,

  // Time series (Sorted Sets)
  // Score: timestamp, Member: eventId/details
  AGENT_BURNS: (address: string) => `pulse:agent:${address}:burns`,

  // Global Stats Hash
  // Fields: active24h, burnsToday, reliabilityAvg
  GLOBAL_STATS: 'pulse:stats:global',

  // Indexing State
  LAST_BLOCK: 'pulse:indexer:last_block',
} as const;
