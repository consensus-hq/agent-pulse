/**
 * Express / Connect middleware for Agent Pulse liveness gating.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { pulseGuard } from "@agent-pulse/middleware/middleware";
 *
 * const app = express();
 * app.use("/api/agents", pulseGuard());
 * ```
 *
 * @module middleware
 */

import { PulseFilter, type PulseFilterOptions, type AliveResponse } from "./index.js";

// ============================================================================
// Types
// ============================================================================

/** Minimal subset of Express Request we depend on. */
interface MiddlewareRequest {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
}

/** Minimal subset of Express Response we depend on. */
interface MiddlewareResponse {
  status(code: number): MiddlewareResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

/** Express-compatible next function. */
type NextFunction = (err?: unknown) => void;

/** The error body returned when an agent has no pulse. */
export interface PulseGuardRejection {
  error: "AGENT_HAS_NO_PULSE";
  message: string;
  address: string;
  docs: string;
}

/** Options for the `pulseGuard` middleware. */
export interface PulseGuardOptions extends PulseFilterOptions {
  /**
   * Request header to read the agent address from.
   * @default "x-agent-address"
   */
  headerName?: string;

  /**
   * Query-string parameter to read the agent address from.
   * @default "agent"
   */
  queryParam?: string;

  /**
   * JSON body field to read the agent address from.
   * @default "agentAddress"
   */
  bodyField?: string;

  /**
   * When `true`, the middleware passes the request through even if it cannot
   * find an agent address (i.e. the address is optional). When `false`
   * (default), a missing address returns 400.
   *
   * @default false
   */
  allowMissing?: boolean;

  /**
   * Custom failure handler. When provided, the middleware calls this instead
   * of the default 403 response when an agent is dead.
   */
  onRejected?: (
    req: MiddlewareRequest,
    res: MiddlewareResponse,
    next: NextFunction,
    info: { address: string; status?: AliveResponse },
  ) => void;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the agent address from the request.
 * Checks (in order): header → query param → body field.
 */
function extractAddress(
  req: MiddlewareRequest,
  headerName: string,
  queryParam: string,
  bodyField: string,
): string | undefined {
  // 1. Header
  const headerVal = req.headers[headerName.toLowerCase()];
  if (typeof headerVal === "string" && headerVal.length > 0) return headerVal;
  // Handle Express-style array headers
  if (Array.isArray(headerVal) && headerVal.length > 0) return headerVal[0];

  // 2. Query param
  if (req.query) {
    const qVal = req.query[queryParam];
    if (typeof qVal === "string" && qVal.length > 0) return qVal;
  }

  // 3. Body field
  if (req.body && typeof req.body === "object") {
    const bVal = (req.body as Record<string, unknown>)[bodyField];
    if (typeof bVal === "string" && bVal.length > 0) return bVal;
  }

  return undefined;
}

// ============================================================================
// Middleware factory
// ============================================================================

/**
 * Create Express/Connect middleware that rejects requests from dead agents.
 *
 * The middleware looks for an Ethereum address in the request (header, query
 * param, or body), calls the Agent Pulse API, and responds with 403 if the
 * agent is not alive.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { pulseGuard } from "@agent-pulse/middleware/middleware";
 *
 * const app = express();
 *
 * // Protect an entire route
 * app.use("/api/protected", pulseGuard());
 *
 * // Custom options
 * app.use("/api/agents", pulseGuard({
 *   headerName: "x-agent-id",
 *   threshold: 3600,       // 1 hour
 *   allowMissing: false,
 *   timeoutMs: 5_000,
 * }));
 * ```
 */
export function pulseGuard(
  options?: PulseGuardOptions,
): (req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction) => void {
  const headerName = options?.headerName ?? "x-agent-address";
  const queryParam = options?.queryParam ?? "agent";
  const bodyField = options?.bodyField ?? "agentAddress";
  const allowMissing = options?.allowMissing ?? false;
  const onRejected = options?.onRejected;

  // Reuse a single PulseFilter instance for connection pooling / config reuse
  const filter = new PulseFilter(options);

  return (req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction): void => {
    const address = extractAddress(req, headerName, queryParam, bodyField);

    // No address found
    if (!address) {
      if (allowMissing) {
        next();
        return;
      }
      res.status(400).json({
        error: "MISSING_AGENT_ADDRESS",
        message: `Provide an agent address via the "${headerName}" header, "${queryParam}" query parameter, or "${bodyField}" body field.`,
        docs: "https://github.com/agenthealth/agent-pulse/tree/main/packages/pulse-filter#express-middleware",
      });
      return;
    }

    // Validate address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      res.status(400).json({
        error: "INVALID_AGENT_ADDRESS",
        message: `"${address}" is not a valid Ethereum address.`,
        docs: "https://github.com/agenthealth/agent-pulse/tree/main/packages/pulse-filter#express-middleware",
      });
      return;
    }

    // Check liveness
    filter
      .getStatus(address)
      .then((status) => {
        const alive =
          status.isAlive &&
          (options?.threshold === undefined ||
            options.threshold <= 0 ||
            status.staleness === null ||
            status.staleness <= options.threshold);

        if (alive) {
          // Attach status to request for downstream handlers
          (req as unknown as Record<string, unknown>)["pulseStatus"] = status;
          next();
          return;
        }

        // Dead agent
        if (onRejected) {
          onRejected(req, res, next, { address, status });
          return;
        }

        const rejection: PulseGuardRejection = {
          error: "AGENT_HAS_NO_PULSE",
          message: `Agent ${address} is not alive. Last pulse: ${status.lastPulseTimestamp > 0 ? new Date(status.lastPulseTimestamp * 1000).toISOString() : "never"}.`,
          address,
          docs: "https://agentpulse.xyz",
        };
        res.status(403).json(rejection);
      })
      .catch((err: unknown) => {
        // Network / API error — fail open with a warning header so callers
        // can observe it, but don't block the request.
        if (res.setHeader) {
          res.setHeader(
            "X-Pulse-Warning",
            `Liveness check failed: ${err instanceof Error ? err.message : "unknown error"}`,
          );
        }
        next();
      });
  };
}
