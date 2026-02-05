import { kv } from "@vercel/kv";

/**
 * Export the raw KV client for modules that need direct access (e.g. webhooks).
 * Prefer the typed helpers below for standard agent/global state operations.
 */
export function getKVClient() {
  return kv;
}

// TTL constants from KV_SCHEMA.md
// CRITICAL: KV_TTL_ISALIVE must be < PROTOCOL_TTL (24h = 86400s)
export const KV_TTL_ISALIVE_SECONDS = 3600; // 1 hour
export const KV_TTL_STATUS_SECONDS = 300;   // 5 minutes
export const KV_TTL_GLOBAL_SECONDS = 60;    // 1 minute

// ============================================================================
// Key Builders
// ============================================================================

function buildAgentKey(address: string, field: string): string {
  const normalized = address.toLowerCase();
  return `pulse:${normalized}:${field}`;
}

function buildGlobalKey(metric: string): string {
  return `pulse:global:${metric}`;
}

// ============================================================================
// Type Converters
// ============================================================================

function kvToBool(value: string | null): boolean | null {
  if (value === null) return null;
  return value === "1";
}

function boolToKv(value: boolean): string {
  return value ? "1" : "0";
}

function kvToInt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

function intToKv(value: number | bigint): string {
  return value.toString();
}

// ============================================================================
// Agent State Operations
// ============================================================================

export interface AgentState {
  isAlive: boolean;
  lastPulse: number;
  streak: number;
  hazardScore: number;
}

/**
 * Get agent state from KV cache
 * Returns null on cache miss for critical fields
 */
export async function getAgentState(address: string): Promise<AgentState | null> {
  try {
    const [lastPulseRaw, isAliveRaw, streakRaw, hazardScoreRaw] = await Promise.all([
      kv.get<string | null>(buildAgentKey(address, "lastPulse")),
      kv.get<string | null>(buildAgentKey(address, "isAlive")),
      kv.get<string | null>(buildAgentKey(address, "streak")),
      kv.get<string | null>(buildAgentKey(address, "hazardScore")),
    ]);

    // Critical fields must be present
    const lastPulse = kvToInt(lastPulseRaw);
    const isAlive = kvToBool(isAliveRaw);

    if (lastPulse === null || isAlive === null) {
      return null;
    }

    return {
      isAlive,
      lastPulse,
      streak: kvToInt(streakRaw) ?? 0,
      hazardScore: kvToInt(hazardScoreRaw) ?? 0,
    };
  } catch (error) {
    console.error("KV read error:", error);
    return null;
  }
}

/**
 * Set agent state in KV cache with appropriate TTLs
 */
/**
 * Set agent state in KV cache with monotonicity check.
 * Skips write if existing lastPulse is newer (prevents out-of-order overwrites).
 */
export async function setAgentState(address: string, state: AgentState): Promise<void> {
  try {
    // Monotonicity check: don't overwrite newer data with older events
    const existingLastPulse = await kv.get<string>(buildAgentKey(address, "lastPulse"));
    if (existingLastPulse !== null && kvToInt(existingLastPulse) !== null) {
      if (kvToInt(existingLastPulse)! >= state.lastPulse) {
        return; // Existing data is newer or same — skip
      }
    }

    const multi = kv.multi();

    // Critical keys: longer TTL
    multi.set(
      buildAgentKey(address, "lastPulse"),
      intToKv(state.lastPulse),
      { ex: KV_TTL_ISALIVE_SECONDS }
    );
    multi.set(
      buildAgentKey(address, "isAlive"),
      boolToKv(state.isAlive),
      { ex: KV_TTL_ISALIVE_SECONDS }
    );

    // Non-critical keys: shorter TTL
    multi.set(
      buildAgentKey(address, "streak"),
      intToKv(state.streak),
      { ex: KV_TTL_STATUS_SECONDS }
    );
    multi.set(
      buildAgentKey(address, "hazardScore"),
      intToKv(state.hazardScore),
      { ex: KV_TTL_STATUS_SECONDS }
    );

    await multi.exec();
  } catch (error) {
    console.error("KV write error:", error);
    // Don't throw - cache population is best-effort
  }
}

/**
 * Delete agent state from KV (for invalidation)
 */
export async function deleteAgentState(address: string): Promise<void> {
  try {
    const multi = kv.multi();
    multi.del(buildAgentKey(address, "lastPulse"));
    multi.del(buildAgentKey(address, "isAlive"));
    multi.del(buildAgentKey(address, "streak"));
    multi.del(buildAgentKey(address, "hazardScore"));
    await multi.exec();
  } catch (error) {
    console.error("KV delete error:", error);
  }
}

// ============================================================================
// Global State Operations
// ============================================================================

export interface PauseState {
  paused: boolean;
}

/**
 * Get pause state from KV
 */
export async function getPauseState(): Promise<boolean | null> {
  try {
    const value = await kv.get<string | null>(buildGlobalKey("pauseState"));
    return kvToBool(value);
  } catch (error) {
    console.error("KV pause state read error:", error);
    return null;
  }
}

/**
 * Set pause state in KV with monotonicity check
 */
export async function setPauseState(paused: boolean, updatedAt: number = Date.now()): Promise<void> {
  try {
    const updatedKey = buildGlobalKey("pauseUpdatedAt");
    const existingUpdatedAt = await kv.get<string | null>(updatedKey);
    const existingTs = kvToInt(existingUpdatedAt);

    if (existingTs !== null && existingTs >= updatedAt) {
      return; // Existing pause state is newer or same — skip
    }

    const multi = kv.multi();
    multi.set(buildGlobalKey("pauseState"), boolToKv(paused), {
      ex: KV_TTL_GLOBAL_SECONDS,
    });
    multi.set(updatedKey, intToKv(updatedAt), {
      ex: KV_TTL_GLOBAL_SECONDS,
    });
    await multi.exec();
  } catch (error) {
    console.error("KV pause state write error:", error);
  }
}

/**
 * Get total agents count from KV
 */
export async function getTotalAgents(): Promise<number | null> {
  try {
    const value = await kv.get<string | null>(buildGlobalKey("totalAgents"));
    return kvToInt(value);
  } catch (error) {
    console.error("KV total agents read error:", error);
    return null;
  }
}

/**
 * Set total agents count in KV with monotonicity check
 */
export async function setTotalAgents(count: number, updatedAt: number = Date.now()): Promise<void> {
  try {
    const updatedKey = buildGlobalKey("totalAgentsUpdatedAt");
    const existingUpdatedAt = await kv.get<string | null>(updatedKey);
    const existingTs = kvToInt(existingUpdatedAt);

    if (existingTs !== null && existingTs >= updatedAt) {
      return; // Existing totalAgents is newer or same — skip
    }

    const multi = kv.multi();
    multi.set(buildGlobalKey("totalAgents"), intToKv(count), {
      ex: KV_TTL_GLOBAL_SECONDS,
    });
    multi.set(updatedKey, intToKv(updatedAt), {
      ex: KV_TTL_GLOBAL_SECONDS,
    });
    await multi.exec();
  } catch (error) {
    console.error("KV total agents write error:", error);
  }
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check if KV is healthy
 */
export async function checkKVHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const startTime = Date.now();

  try {
    const multi = kv.multi();
    multi.set("__health_check__", "ok", { ex: 10 });
    multi.del("__health_check__");
    await multi.exec();

    return {
      healthy: true,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
