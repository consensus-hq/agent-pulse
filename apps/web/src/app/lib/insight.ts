/**
 * Thirdweb Insight API Client
 * 
 * This module provides a typed wrapper around the thirdweb Insight REST API
 * for querying historical Pulse events and other protocol events.
 * 
 * The Insight API replaces viem's getLogs and any custom event listeners.
 * 
 * @see https://insight.thirdweb.com
 */

import { setAgentState, setPauseState, type AgentState } from '@/app/lib/kv';

// ============================================================================
// Configuration
// ============================================================================

/** Base Sepolia Insight API */
const INSIGHT_BASE_SEPOLIA = 'https://84532.insight.thirdweb.com';

/** Base Mainnet Insight API */
const INSIGHT_BASE_MAINNET = 'https://8453.insight.thirdweb.com';

/** Environment-based chain selection */
const INSIGHT_BASE_URL = process.env.NEXT_PUBLIC_CHAIN_ID === '8453' 
  ? INSIGHT_BASE_MAINNET 
  : INSIGHT_BASE_SEPOLIA;

/** Registry contract addresses */
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_CHAIN_ID === '8453'
  ? process.env.NEXT_PUBLIC_PULSE_REGISTRY_MAINNET || '0x0000000000000000000000000000000000000000'
  : process.env.NEXT_PUBLIC_PULSE_REGISTRY_SEPOLIA || '0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612';

/** Token contract addresses */
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_CHAIN_ID === '8453'
  ? process.env.NEXT_PUBLIC_PULSE_TOKEN_MAINNET || '0x0000000000000000000000000000000000000000'
  : process.env.NEXT_PUBLIC_PULSE_TOKEN_SEPOLIA || '0x7f24C286872c9594499CD634c7Cc7735551242a2';

/** Signal sink for burn detection */
const SIGNAL_SINK = '0x000000000000000000000000000000000000dEaD';

// ============================================================================
// Event Signatures
// ============================================================================

/** Pulse event signature: Pulse(address indexed agent, uint256 amount, uint256 timestamp, uint256 streak) */
const PULSE_SIGNATURE = 'Pulse(address,uint256,uint256,uint256)';

/** Paused event signature */
const PAUSED_SIGNATURE = 'Paused(address)';

/** Unpaused event signature */
const UNPAUSED_SIGNATURE = 'Unpaused(address)';

/** ERC20 Transfer event signature */
const TRANSFER_SIGNATURE = 'Transfer(address,address,uint256)';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Raw event data from Insight API (snake_case fields)
 * 
 * The Insight API returns flat objects with snake_case keys.
 * Decoded params (when ?decode=true) appear in `decoded.indexed_params`
 * and `decoded.non_indexed_params`.
 */
export interface InsightDecodedEvent {
  chain_id: string;
  block_number: number;
  block_hash: string;
  block_timestamp: number;
  transaction_hash: string;
  transaction_index: number;
  log_index: number;
  address: string;
  data: string;
  topics: string[];
  decoded?: {
    name: string;
    signature: string;
    indexed_params: Record<string, string>;
    non_indexed_params: Record<string, string>;
  };
}

/**
 * Pulse event data (decoded)
 */
export interface PulseEventData {
  /** Agent address */
  agent: string;
  /** Pulse amount */
  amount: string;
  /** Unix timestamp */
  timestamp: string;
  /** Current streak */
  streak: string;
}

/**
 * Pause event data (decoded)
 */
export interface PauseEventData {
  /** Account that triggered the pause */
  account: string;
}

/**
 * ERC20 Transfer event data (decoded)
 */
export interface TransferEventData {
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Transfer amount */
  value: string;
}

/**
 * Paginated response from Insight API
 */
export interface InsightPaginatedResponse<T> {
  /** Event data */
  data: T[];
  /** Pagination metadata */
  meta: {
    /** Total number of events */
    totalEvents: number;
    /** Current page */
    page: number;
    /** Page size */
    limit: number;
    /** Total pages */
    totalPages: number;
    /** Has next page */
    hasNextPage: boolean;
  };
}

/**
 * Options for querying Pulse events
 */
export interface PulseEventQueryOptions {
  /** Filter by specific agent address */
  agent?: string;
  /** Number of results per page (1-100) */
  limit?: number;
  /** Page number (0-indexed) */
  page?: number;
  /** Sort field */
  sortBy?: 'block_number' | 'timestamp' | 'transaction_index';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Filter by block number range */
  fromBlock?: number;
  /** Filter by block number range */
  toBlock?: number;
}

/**
 * Options for querying pause events
 */
export interface PauseEventQueryOptions {
  /** Number of results per page */
  limit?: number;
  /** Page number */
  page?: number;
  /** Sort field */
  sortBy?: 'block_number' | 'timestamp';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Options for querying burn transfers
 */
export interface BurnTransferQueryOptions {
  /** Filter by sender address */
  from?: string;
  /** Number of results per page */
  limit?: number;
  /** Page number */
  page?: number;
  /** Sort field */
  sortBy?: 'block_number' | 'timestamp';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Pulse event with full context
 */
export interface PulseEvent {
  /** Agent address */
  agent: string;
  /** Pulse amount (wei) */
  amount: bigint;
  /** Unix timestamp */
  timestamp: number;
  /** Current streak */
  streak: number;
  /** Block number */
  blockNumber: number;
  /** Log index */
  logIndex: number;
  /** Transaction hash */
  transactionHash: string;
}

/**
 * Pause event with full context
 */
export interface PauseEvent {
  /** Account that triggered */
  account: string;
  /** Block number */
  blockNumber: number;
  /** Timestamp */
  timestamp: number;
  /** Transaction hash */
  transactionHash: string;
  /** True if paused, false if unpaused */
  isPaused: boolean;
}

/**
 * Burn transfer event with full context
 */
export interface BurnTransferEvent {
  /** Sender address */
  from: string;
  /** Burn amount */
  amount: bigint;
  /** Block number */
  blockNumber: number;
  /** Timestamp */
  timestamp: number;
  /** Transaction hash */
  transactionHash: string;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Insight API error
 */
export class InsightError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode?: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = 'InsightError';
  }
}

// ============================================================================
// Core API Client
// ============================================================================

/**
 * Get the thirdweb client ID from environment
 */
function getClientId(): string {
  const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
  if (!clientId) {
    throw new InsightError(
      'MISSING_CLIENT_ID',
      'NEXT_PUBLIC_THIRDWEB_CLIENT_ID environment variable not set'
    );
  }
  return clientId;
}

/**
 * Make a request to the Insight API
 */
async function insightRequest<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>
): Promise<InsightPaginatedResponse<T>> {
  const clientId = getClientId();
  
  // Build URL with query params
  const url = new URL(`${INSIGHT_BASE_URL}${endpoint}`);
  
  // Always request decoded events
  url.searchParams.set('decode', 'true');
  
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-client-id': clientId,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new InsightError(
        'API_ERROR',
        `Insight API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        response.status
      );
    }
    
    const data = await response.json();
    
    // Normalize response format
    // Use ?? (nullish coalescing) not || to preserve valid 0 values
    const dataArray = data.data ?? [];
    const rawTotal = data.meta?.total_events ?? data.meta?.totalEvents ?? null;
    // If the API doesn't provide a total count (or returns 0 while data exists),
    // fall back to data.length as a minimum floor
    const totalEvents = (rawTotal !== null && rawTotal >= dataArray.length)
      ? rawTotal
      : dataArray.length;
    const limit = data.meta?.limit ?? 50;
    const totalPages = data.meta?.total_pages ?? data.meta?.totalPages
      ?? (totalEvents > 0 ? Math.ceil(totalEvents / limit) : 0);

    return {
      data: dataArray,
      meta: {
        totalEvents,
        page: data.meta?.page ?? 0,
        limit,
        totalPages,
        hasNextPage: data.meta?.has_next_page ?? data.meta?.hasNextPage ?? false,
      },
    };
  } catch (error) {
    if (error instanceof InsightError) {
      throw error;
    }
    throw new InsightError(
      'REQUEST_FAILED',
      `Failed to make Insight API request: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Event Queries
// ============================================================================

/**
 * Get Pulse events from the registry contract
 * 
 * @param options - Query options for pagination and filtering
 * @returns Paginated Pulse events
 * 
 * @example
 * ```typescript
 * const { data, meta } = await getPulseEvents({ 
 *   agent: '0x123...', 
 *   limit: 50, 
 *   page: 0,
 *   sortOrder: 'desc'
 * });
 * ```
 */
export async function getPulseEvents(
  options: PulseEventQueryOptions = {}
): Promise<InsightPaginatedResponse<PulseEvent>> {
  const params: Record<string, string | number> = {
    limit: options.limit ?? 50,
    page: options.page ?? 0,
    sort_by: options.sortBy ?? 'block_number',
    sort_order: options.sortOrder ?? 'desc',
  };
  
  if (options.fromBlock !== undefined) {
    params.from_block = options.fromBlock;
  }
  if (options.toBlock !== undefined) {
    params.to_block = options.toBlock;
  }
  
  // Filter by agent address using topic1 (indexed parameter)
  if (options.agent) {
    params.filter_topic1 = options.agent.toLowerCase();
  }
  
  const response = await insightRequest<InsightDecodedEvent>(
    `/v1/events/${REGISTRY_ADDRESS}/${PULSE_SIGNATURE}`,
    params
  );
  
  // Transform decoded events to PulseEvent format
  // Insight API returns: { data: "0x...", topics: [...], decoded: { indexed_params: {}, non_indexed_params: {} }, block_number, transaction_hash, log_index, block_timestamp }
  const events: PulseEvent[] = response.data.map((event) => {
    const decoded = event.decoded as { indexed_params?: Record<string, string>; non_indexed_params?: Record<string, string> } | undefined;
    const params = { ...decoded?.indexed_params, ...decoded?.non_indexed_params };
    return {
      agent: (params.agent ?? '0x0000000000000000000000000000000000000000').toLowerCase(),
      amount: BigInt(params.amount ?? 0),
      timestamp: Number(params.timestamp ?? event.block_timestamp ?? 0),
      streak: Number(params.streak ?? 0),
      blockNumber: Number(event.block_number ?? 0),
      logIndex: Number(event.log_index ?? 0),
      transactionHash: (event.transaction_hash as string) ?? '0x',
    };
  });
  
  return {
    data: events,
    meta: response.meta,
  };
}

/**
 * Get pause/unpause events from the registry contract
 * 
 * @param options - Query options for pagination
 * @returns Paginated pause events
 * 
 * @example
 * ```typescript
 * const { data } = await getPauseEvents({ limit: 10 });
 * ```
 */
export async function getPauseEvents(
  options: PauseEventQueryOptions = {}
): Promise<InsightPaginatedResponse<PauseEvent>> {
  const params: Record<string, string | number> = {
    limit: options.limit ?? 50,
    page: options.page ?? 0,
    sort_by: options.sortBy ?? 'block_number',
    sort_order: options.sortOrder ?? 'desc',
  };
  
  // Fetch both paused and unpaused events separately and merge
  const [pausedResponse, unpausedResponse] = await Promise.all([
    insightRequest<InsightDecodedEvent>(
      `/v1/events/${REGISTRY_ADDRESS}/${PAUSED_SIGNATURE}`,
      params
    ),
    insightRequest<InsightDecodedEvent>(
      `/v1/events/${REGISTRY_ADDRESS}/${UNPAUSED_SIGNATURE}`,
      params
    ),
  ]);
  
  // Transform paused events
  const pausedEvents: PauseEvent[] = pausedResponse.data.map((event) => {
    const decoded = event.decoded as { indexed_params?: Record<string, string>; non_indexed_params?: Record<string, string> } | undefined;
    const params = { ...decoded?.indexed_params, ...decoded?.non_indexed_params };
    return {
      account: (params.account ?? '0x0').toLowerCase(),
      blockNumber: Number(event.block_number ?? 0),
      timestamp: Number(event.block_timestamp ?? 0),
      transactionHash: (event.transaction_hash as string) ?? "0x",
      isPaused: true,
    };
  });
  
  // Transform unpaused events
  const unpausedEvents: PauseEvent[] = unpausedResponse.data.map((event) => {
    const decoded = event.decoded as { indexed_params?: Record<string, string>; non_indexed_params?: Record<string, string> } | undefined;
    const params = { ...decoded?.indexed_params, ...decoded?.non_indexed_params };
    return {
      account: (params.account ?? '0x0').toLowerCase(),
      blockNumber: Number(event.block_number ?? 0),
      timestamp: Number(event.block_timestamp ?? 0),
      transactionHash: (event.transaction_hash as string) ?? "0x",
      isPaused: false,
    };
  });
  
  // Merge and sort by block number/timestamp
  const allEvents = [...pausedEvents, ...unpausedEvents].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return b.blockNumber - a.blockNumber; // Descending
    }
    return b.timestamp - a.timestamp;
  });
  
  // Apply pagination after merge
  const limit = options.limit ?? 50;
  const page = options.page ?? 0;
  const start = page * limit;
  const paginatedEvents = allEvents.slice(start, start + limit);
  
  return {
    data: paginatedEvents,
    meta: {
      totalEvents: allEvents.length,
      page,
      limit,
      totalPages: Math.ceil(allEvents.length / limit),
      hasNextPage: start + limit < allEvents.length,
    },
  };
}

/**
 * Get burn transfers (transfers to 0xdEaD address)
 * 
 * @param options - Query options for pagination and filtering
 * @returns Paginated burn transfer events
 * 
 * @example
 * ```typescript
 * const { data } = await getBurnTransfers({ from: '0x123...', limit: 50 });
 * ```
 */
export async function getBurnTransfers(
  options: BurnTransferQueryOptions = {}
): Promise<InsightPaginatedResponse<BurnTransferEvent>> {
  const params: Record<string, string | number> = {
    limit: options.limit ?? 50,
    page: options.page ?? 0,
    sort_by: options.sortBy ?? 'block_number',
    sort_order: options.sortOrder ?? 'desc',
  };
  
  // Filter by recipient (topic2 for Transfer events is the 'to' address)
  params.filter_topic2 = SIGNAL_SINK.toLowerCase();
  
  // Filter by sender if specified
  if (options.from) {
    params.filter_topic1 = options.from.toLowerCase();
  }
  
  const response = await insightRequest<InsightDecodedEvent>(
    `/v1/events/${TOKEN_ADDRESS}/${TRANSFER_SIGNATURE}`,
    params
  );
  
  // Transform decoded events
  const events: BurnTransferEvent[] = response.data.map((event) => {
    const decoded = event.decoded as { indexed_params?: Record<string, string>; non_indexed_params?: Record<string, string> } | undefined;
    const params = { ...decoded?.indexed_params, ...decoded?.non_indexed_params };
    return {
      from: (params.from ?? '0x0').toLowerCase(),
      amount: BigInt(params.value ?? 0),
      blockNumber: Number(event.block_number ?? 0),
      timestamp: Number(event.block_timestamp ?? 0),
      transactionHash: (event.transaction_hash as string) ?? "0x",
    };
  });
  
  return {
    data: events,
    meta: response.meta,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the latest Pulse event for a specific agent
 * 
 * @param agentAddress - The agent's address
 * @returns The latest Pulse event or null if none found
 */
export async function getLatestPulseEvent(
  agentAddress: string
): Promise<PulseEvent | null> {
  const response = await getPulseEvents({
    agent: agentAddress,
    limit: 1,
    page: 0,
    sortOrder: 'desc',
  });
  
  return response.data[0] || null;
}

/**
 * Get Pulse events for multiple agents in a single call
 * This uses multiple parallel requests - consider rate limits
 * 
 * @param agentAddresses - Array of agent addresses
 * @param limit - Limit per agent
 * @returns Map of address to their Pulse events
 */
export async function getPulseEventsForAgents(
  agentAddresses: string[],
  limit: number = 10
): Promise<Map<string, PulseEvent[]>> {
  const results = await Promise.all(
    agentAddresses.map(async (address) => {
      const response = await getPulseEvents({
        agent: address,
        limit,
        sortOrder: 'desc',
      });
      return { address: address.toLowerCase(), events: response.data };
    })
  );
  
  const map = new Map<string, PulseEvent[]>();
  for (const { address, events } of results) {
    map.set(address, events);
  }
  return map;
}

/**
 * Check if the Insight API is healthy
 * 
 * @returns True if the API is accessible
 */
export async function checkInsightHealth(): Promise<boolean> {
  try {
    await getClientId();
    // Make a lightweight request to verify connectivity
    await getPulseEvents({ limit: 1 });
    return true;
  } catch (error) {
    console.error('Insight API health check failed:', error);
    return false;
  }
}

// ============================================================================
// Cache Integration
// ============================================================================

/**
 * Update KV cache from a Pulse event
 * Called by the webhook handler to keep cache in sync
 * 
 * @param event - The Pulse event data
 */
export async function updateKVFromPulseEvent(event: PulseEvent): Promise<void> {
  const address = event.agent.toLowerCase();
  
  // Use shared KV module — handles atomic pipeline updates per KV_SCHEMA.md
  const state: AgentState = {
    isAlive: true,
    streak: event.streak,
    lastPulse: event.timestamp,
    hazardScore: 0,
  };
  
  await setAgentState(address, state);
}

/**
 * Update KV cache from a pause event
 * 
 * @param isPaused - New pause state
 */
export async function updateKVFromPauseEvent(isPaused: boolean, updatedAt: number): Promise<void> {
  // Use shared KV module — handles TTL (30s) per KV_SCHEMA.md
  await setPauseState(isPaused, updatedAt);
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { REGISTRY_ADDRESS, TOKEN_ADDRESS, SIGNAL_SINK };
