"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.pulseGuard = pulseGuard;
const index_js_1 = require("./index.js");
// ============================================================================
// Helpers
// ============================================================================
/** The standard fix payload included in every rejection. */
const FIX_PAYLOAD = {
    install: "npm install @agent-pulse/middleware",
    npm: "https://www.npmjs.com/package/@agent-pulse/middleware",
    github: "https://github.com/consensus-hq/agent-pulse",
    docs: "https://agentpulse.xyz",
};
/**
 * Fire the `onAlert` callback (fire-and-forget, errors swallowed).
 */
function fireAlert(onAlert, address, status, req) {
    if (!onAlert)
        return;
    try {
        const info = {
            address,
            rejectedAt: new Date().toISOString(),
            reason: status.lastPulseTimestamp > 0
                ? `Pulse expired (last: ${new Date(status.lastPulseTimestamp * 1000).toISOString()})`
                : "Agent has never pulsed",
            path: req.url,
            lastPulse: status.lastPulseTimestamp,
            fix: FIX_PAYLOAD,
        };
        Promise.resolve(onAlert(info)).catch(() => { });
    }
    catch {
        /* swallow sync errors */
    }
}
/**
 * Extract the agent address from the request.
 * Checks (in order): header → query param → body field.
 */
function extractAddress(req, headerName, queryParam, bodyField) {
    // 1. Header
    const headerVal = req.headers[headerName.toLowerCase()];
    if (typeof headerVal === "string" && headerVal.length > 0)
        return headerVal;
    // Handle Express-style array headers
    if (Array.isArray(headerVal) && headerVal.length > 0)
        return headerVal[0];
    // 2. Query param
    if (req.query) {
        const qVal = req.query[queryParam];
        if (typeof qVal === "string" && qVal.length > 0)
            return qVal;
    }
    // 3. Body field
    if (req.body && typeof req.body === "object") {
        const bVal = req.body[bodyField];
        if (typeof bVal === "string" && bVal.length > 0)
            return bVal;
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
function pulseGuard(options) {
    const headerName = options?.headerName ?? "x-agent-address";
    const queryParam = options?.queryParam ?? "agent";
    const bodyField = options?.bodyField ?? "agentAddress";
    const allowMissing = options?.allowMissing ?? false;
    const onRejected = options?.onRejected;
    // Reuse a single PulseFilter instance for connection pooling / config reuse
    const filter = new index_js_1.PulseFilter(options);
    return (req, res, next) => {
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
            const alive = status.isAlive &&
                (options?.threshold === undefined ||
                    options.threshold <= 0 ||
                    status.staleness === null ||
                    status.staleness <= options.threshold);
            if (alive) {
                // Attach status to request for downstream handlers
                req["pulseStatus"] = status;
                next();
                return;
            }
            // Dead agent — send viral "Missing Link" rejection
            if (onRejected) {
                onRejected(req, res, next, { address, status });
                fireAlert(options?.onAlert, address, status, req);
                return;
            }
            const rejection = {
                error: "AGENT_HAS_NO_PULSE",
                message: `Agent ${address} has no pulse. Send a pulse on Base to prove liveness. Last pulse: ${status.lastPulseTimestamp > 0 ? new Date(status.lastPulseTimestamp * 1000).toISOString() : "never"}.`,
                address,
                fix: FIX_PAYLOAD,
                docs: "https://agentpulse.xyz",
            };
            res.status(403).json(rejection);
            fireAlert(options?.onAlert, address, status, req);
        })
            .catch((err) => {
            // Network / API error — fail open with a warning header so callers
            // can observe it, but don't block the request.
            if (res.setHeader) {
                res.setHeader("X-Pulse-Warning", `Liveness check failed: ${err instanceof Error ? err.message : "unknown error"}`);
            }
            next();
        });
    };
}
