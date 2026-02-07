/**
 * @agent-pulse/middleware
 *
 * Lightweight liveness filter for Agent Pulse.
 * Zero dependencies — uses only the native fetch() API.
 * Works in Node.js 18+, Bun, Deno, Cloudflare Workers, and edge runtimes.
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

/** Options shared across all filter functions and the PulseFilter class. */
export interface PulseFilterOptions {
  /**
   * Base URL for the Agent Pulse API.
   * @default "https://agent-pulse-nine.vercel.app"
   */
  apiUrl?: string;

  /**
   * Maximum staleness in **seconds**. An agent whose last pulse is older than
   * this value is considered dead even if the API says `isAlive: true`.
   *
   * Set to `0` or `undefined` to rely solely on the on-chain TTL reported by
   * the API.
   */
  threshold?: number;

  /**
   * Fetch timeout in milliseconds.
   * @default 10_000
   */
  timeoutMs?: number;

  /**
   * Number of retries on network/server errors (5xx, timeouts).
   * @default 2
   */
  retries?: number;

  /**
   * Delay between retries in milliseconds. Doubles after each attempt
   * (exponential back-off capped at 4× this value).
   * @default 500
   */
  retryDelayMs?: number;
}

/** JSON shape returned by the `/api/v2/agent/{address}/alive` endpoint. */
export interface AliveResponse {
  address: string;
  isAlive: boolean;
  lastPulseTimestamp: number;
  streak: number;
  staleness: number | null;
  ttl: number;
  checkedAt: string;
}

/** Result of a batch `filterAlive` call with full details. */
export interface FilterResult {
  /** Addresses that are alive (and within threshold, if set). */
  alive: string[];
  /** Full API response for every queried address. */
  details: AliveResponse[];
  /** Addresses that failed lookup (network error, bad address, etc.). */
  errors: Array<{ address: string; reason: string }>;
  /** ISO-8601 timestamp when the filter was executed. */
  checkedAt: string;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_API_URL = "https://agent-pulse-nine.vercel.app";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

// ============================================================================
// Helpers
// ============================================================================

/** Validate a hex Ethereum address (0x + 40 hex chars, case-insensitive). */
function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/** Build resolved options with defaults filled in. */
function resolveOptions(opts?: PulseFilterOptions) {
  return {
    apiUrl: opts?.apiUrl ?? DEFAULT_API_URL,
    threshold: opts?.threshold,
    timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: opts?.retries ?? DEFAULT_RETRIES,
    retryDelayMs: opts?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  } as const;
}

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout + exponential-backoff retries.
 * Retries on network errors and HTTP 5xx responses.
 */
async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  retries: number,
  retryDelayMs: number,
): Promise<Response> {
  let lastError: unknown;
  const maxAttempts = 1 + retries;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      // Don't retry client errors (4xx) — only server errors
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // Server error — retry if we have attempts left
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }

    // Wait before retrying (exponential back-off capped at 4× base delay)
    if (attempt < maxAttempts - 1) {
      const delay = Math.min(retryDelayMs * 2 ** attempt, retryDelayMs * 4);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Fetch a single agent's alive status from the API.
 * Returns `null` on error (caller should record the error).
 */
async function fetchAliveStatus(
  address: string,
  apiUrl: string,
  timeoutMs: number,
  retries: number,
  retryDelayMs: number,
): Promise<AliveResponse> {
  const url = `${apiUrl}/api/v2/agent/${address}/alive`;
  const response = await fetchWithRetry(url, timeoutMs, retries, retryDelayMs);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} from ${url}: ${body.slice(0, 200)}`);
  }

  return (await response.json()) as AliveResponse;
}

/**
 * Determine whether an agent should be considered alive given the API
 * response and an optional caller-specified threshold.
 */
function evaluateAliveness(
  data: AliveResponse,
  threshold?: number,
): boolean {
  // Respect on-chain TTL first
  if (!data.isAlive) return false;

  // Apply optional caller threshold
  if (threshold !== undefined && threshold > 0 && data.staleness !== null) {
    return data.staleness <= threshold;
  }

  return true;
}

// ============================================================================
// Public API — standalone functions
// ============================================================================

/**
 * Check whether a single agent address is alive.
 *
 * @example
 * ```ts
 * import { isAlive } from "@agent-pulse/middleware";
 *
 * if (await isAlive("0xAbc123...def")) {
 *   console.log("Agent is alive!");
 * }
 * ```
 */
export async function isAlive(
  address: string,
  options?: PulseFilterOptions,
): Promise<boolean> {
  if (!isValidAddress(address)) {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }

  const opts = resolveOptions(options);
  const data = await fetchAliveStatus(
    address,
    opts.apiUrl,
    opts.timeoutMs,
    opts.retries,
    opts.retryDelayMs,
  );

  return evaluateAliveness(data, opts.threshold);
}

/**
 * Filter a list of agent addresses, returning only the alive ones.
 *
 * @example
 * ```ts
 * import { filterAlive } from "@agent-pulse/middleware";
 *
 * const alive = await filterAlive([
 *   "0xAbc...",
 *   "0xDef...",
 *   "0x123...",
 * ]);
 * console.log(alive); // ["0xAbc..."]
 * ```
 */
export async function filterAlive(
  agents: string[],
  options?: PulseFilterOptions,
): Promise<string[]> {
  const result = await filterAliveDetailed(agents, options);
  return result.alive;
}

/**
 * Like {@link filterAlive} but returns the full {@link FilterResult} with
 * details and error information for every agent queried.
 */
export async function filterAliveDetailed(
  agents: string[],
  options?: PulseFilterOptions,
): Promise<FilterResult> {
  const opts = resolveOptions(options);
  const checkedAt = new Date().toISOString();

  const alive: string[] = [];
  const details: AliveResponse[] = [];
  const errors: Array<{ address: string; reason: string }> = [];

  // Validate first
  const valid: string[] = [];
  for (const addr of agents) {
    if (!isValidAddress(addr)) {
      errors.push({ address: addr, reason: "Invalid Ethereum address format" });
    } else {
      valid.push(addr);
    }
  }

  if (valid.length === 0) {
    return { alive, details, errors, checkedAt };
  }

  // Fetch in parallel (with natural concurrency from the runtime)
  const settled = await Promise.allSettled(
    valid.map((addr) =>
      fetchAliveStatus(addr, opts.apiUrl, opts.timeoutMs, opts.retries, opts.retryDelayMs),
    ),
  );

  for (let i = 0; i < valid.length; i++) {
    const result = settled[i]!;
    const addr = valid[i]!;

    if (result.status === "rejected") {
      const reason =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({ address: addr, reason });
      continue;
    }

    const data = result.value;
    details.push(data);

    if (evaluateAliveness(data, opts.threshold)) {
      alive.push(addr);
    }
  }

  return { alive, details, errors, checkedAt };
}

// ============================================================================
// PulseFilter class — reusable instance with pre-configured options
// ============================================================================

/**
 * Reusable filter instance with pre-configured options.
 *
 * @example
 * ```ts
 * import { PulseFilter } from "@agent-pulse/middleware";
 *
 * const pulse = new PulseFilter({ threshold: 3600 });
 *
 * const alive = await pulse.isAlive("0xAbc...");
 * const list  = await pulse.filterAlive(["0xAbc...", "0xDef..."]);
 * const full  = await pulse.filterAliveDetailed(["0xAbc..."]);
 * ```
 */
export class PulseFilter {
  private readonly opts: PulseFilterOptions;

  constructor(options?: PulseFilterOptions) {
    this.opts = options ?? {};
  }

  /** Check whether a single agent is alive. */
  async isAlive(address: string): Promise<boolean> {
    return isAlive(address, this.opts);
  }

  /** Filter a list of addresses to only alive agents. */
  async filterAlive(agents: string[]): Promise<string[]> {
    return filterAlive(agents, this.opts);
  }

  /** Filter with full details and error info. */
  async filterAliveDetailed(agents: string[]): Promise<FilterResult> {
    return filterAliveDetailed(agents, this.opts);
  }

  /**
   * Get the raw API response for a single agent.
   * Throws on invalid address or network error.
   */
  async getStatus(address: string): Promise<AliveResponse> {
    if (!isValidAddress(address)) {
      throw new Error(`Invalid Ethereum address: ${address}`);
    }
    const opts = resolveOptions(this.opts);
    return fetchAliveStatus(
      address,
      opts.apiUrl,
      opts.timeoutMs,
      opts.retries,
      opts.retryDelayMs,
    );
  }
}

// Re-export middleware from subpath for convenience
export { pulseGuard, type PulseGuardOptions } from "./middleware.js";
