"use strict";
/**
 * @agent-pulse/middleware
 *
 * Lightweight liveness filter for Agent Pulse.
 * Zero dependencies — uses only the native fetch() API.
 * Works in Node.js 18+, Bun, Deno, Cloudflare Workers, and edge runtimes.
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pulseGuard = exports.PulseFilter = void 0;
exports.isAlive = isAlive;
exports.filterAlive = filterAlive;
exports.filterAliveDetailed = filterAliveDetailed;
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
function isValidAddress(address) {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
}
/** Build resolved options with defaults filled in. */
function resolveOptions(opts) {
    return {
        apiUrl: opts?.apiUrl ?? DEFAULT_API_URL,
        threshold: opts?.threshold,
        timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        retries: opts?.retries ?? DEFAULT_RETRIES,
        retryDelayMs: opts?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    };
}
/** Sleep helper. */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Fetch with timeout + exponential-backoff retries.
 * Retries on network errors and HTTP 5xx responses.
 */
async function fetchWithRetry(url, timeoutMs, retries, retryDelayMs) {
    let lastError;
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
        }
        catch (err) {
            lastError = err;
        }
        finally {
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
async function fetchAliveStatus(address, apiUrl, timeoutMs, retries, retryDelayMs) {
    const url = `${apiUrl}/api/v2/agent/${address}/alive`;
    const response = await fetchWithRetry(url, timeoutMs, retries, retryDelayMs);
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} from ${url}: ${body.slice(0, 200)}`);
    }
    return (await response.json());
}
/**
 * Determine whether an agent should be considered alive given the API
 * response and an optional caller-specified threshold.
 */
function evaluateAliveness(data, threshold) {
    // Respect on-chain TTL first
    if (!data.isAlive)
        return false;
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
async function isAlive(address, options) {
    if (!isValidAddress(address)) {
        throw new Error(`Invalid Ethereum address: ${address}`);
    }
    const opts = resolveOptions(options);
    const data = await fetchAliveStatus(address, opts.apiUrl, opts.timeoutMs, opts.retries, opts.retryDelayMs);
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
async function filterAlive(agents, options) {
    const result = await filterAliveDetailed(agents, options);
    return result.alive;
}
/**
 * Like {@link filterAlive} but returns the full {@link FilterResult} with
 * details and error information for every agent queried.
 */
async function filterAliveDetailed(agents, options) {
    const opts = resolveOptions(options);
    const checkedAt = new Date().toISOString();
    const alive = [];
    const details = [];
    const errors = [];
    // Validate first
    const valid = [];
    for (const addr of agents) {
        if (!isValidAddress(addr)) {
            errors.push({ address: addr, reason: "Invalid Ethereum address format" });
        }
        else {
            valid.push(addr);
        }
    }
    if (valid.length === 0) {
        return { alive, details, errors, checkedAt };
    }
    // Fetch in parallel (with natural concurrency from the runtime)
    const settled = await Promise.allSettled(valid.map((addr) => fetchAliveStatus(addr, opts.apiUrl, opts.timeoutMs, opts.retries, opts.retryDelayMs)));
    for (let i = 0; i < valid.length; i++) {
        const result = settled[i];
        const addr = valid[i];
        if (result.status === "rejected") {
            const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
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
class PulseFilter {
    opts;
    constructor(options) {
        this.opts = options ?? {};
    }
    /** Check whether a single agent is alive. */
    async isAlive(address) {
        return isAlive(address, this.opts);
    }
    /** Filter a list of addresses to only alive agents. */
    async filterAlive(agents) {
        return filterAlive(agents, this.opts);
    }
    /** Filter with full details and error info. */
    async filterAliveDetailed(agents) {
        return filterAliveDetailed(agents, this.opts);
    }
    /**
     * Get the raw API response for a single agent.
     * Throws on invalid address or network error.
     */
    async getStatus(address) {
        if (!isValidAddress(address)) {
            throw new Error(`Invalid Ethereum address: ${address}`);
        }
        const opts = resolveOptions(this.opts);
        return fetchAliveStatus(address, opts.apiUrl, opts.timeoutMs, opts.retries, opts.retryDelayMs);
    }
}
exports.PulseFilter = PulseFilter;
// Re-export middleware from subpath for convenience
var middleware_js_1 = require("./middleware.js");
Object.defineProperty(exports, "pulseGuard", { enumerable: true, get: function () { return middleware_js_1.pulseGuard; } });
