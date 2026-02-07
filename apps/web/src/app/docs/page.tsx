"use client";

import { useState, useCallback } from "react";
import type { Metadata } from "next";

/* ================================================================
   Agent Pulse — Interactive API Documentation
   ================================================================
   /docs — human-readable API reference with curl examples,
   response schemas, rate-limit info, and x402 payment flow.
   ================================================================ */

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

interface Param {
  name: string;
  in: "path" | "query" | "header" | "body";
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

interface Field {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

interface EndpointDef {
  id: string;
  method: "GET" | "POST" | "HEAD";
  path: string;
  summary: string;
  description: string;
  tier: "free" | "paid";
  price?: string;
  cacheTTL?: string;
  params?: Param[];
  bodySchema?: Field[];
  responseFields: Field[];
  responseExample: string;
  curlExample: string;
  errorCodes: { code: number; description: string }[];
}

// ────────────────────────────────────────────
// Endpoint definitions
// ────────────────────────────────────────────

const BASE = "https://agent-pulse-nine.vercel.app";
const EXAMPLE_ADDR = "0x1234567890abcdef1234567890abcdef12345678";

const ENDPOINTS: EndpointDef[] = [
  // ── Free: v2 alive ──
  {
    id: "v2-alive",
    method: "GET",
    path: "/api/v2/agent/{address}/alive",
    summary: "Check agent liveness",
    description:
      "Binary liveness check — the GTM wedge. Returns whether an agent is alive on-chain, its streak, staleness, and TTL. No payment required. Designed to be the frictionless entry point for integrators.",
    tier: "free",
    cacheTTL: "30 s",
    params: [
      {
        name: "address",
        in: "path",
        type: "string (0x…)",
        required: true,
        description: "Ethereum address of the agent",
      },
    ],
    responseFields: [
      { name: "address", type: "string", description: "Lowercased agent address", required: true },
      { name: "isAlive", type: "boolean", description: "Whether the agent is currently alive", required: true },
      { name: "lastPulseTimestamp", type: "integer", description: "Unix timestamp of the last pulse", required: true },
      { name: "streak", type: "integer", description: "Current consecutive pulse streak", required: true },
      { name: "staleness", type: "integer", description: "Seconds since last pulse", required: true },
      { name: "ttl", type: "integer", description: "Protocol TTL in seconds (86 400)", required: true },
      { name: "checkedAt", type: "string", description: "ISO 8601 timestamp of this check" },
      { name: "note", type: "string", description: "Present when agent is not found in registry" },
    ],
    responseExample: JSON.stringify(
      {
        address: EXAMPLE_ADDR,
        isAlive: true,
        lastPulseTimestamp: 1738900000,
        streak: 42,
        staleness: 1200,
        ttl: 86400,
        checkedAt: "2026-02-07T12:00:00.000Z",
      },
      null,
      2
    ),
    curlExample: `curl -s "${BASE}/api/v2/agent/${EXAMPLE_ADDR}/alive" | jq`,
    errorCodes: [
      { code: 400, description: "Invalid Ethereum address format" },
    ],
  },

  // ── Free: v1 status ──
  {
    id: "v1-status",
    method: "GET",
    path: "/api/status/{address}",
    summary: "Get full agent status",
    description:
      "Returns the complete liveness status including streak, hazard score, and TTL for a specific agent. Cached in Vercel KV for low-latency reads.",
    tier: "free",
    cacheTTL: "30 s (KV-backed)",
    params: [
      {
        name: "address",
        in: "path",
        type: "string (0x…)",
        required: true,
        description: "Ethereum address of the agent",
      },
    ],
    responseFields: [
      { name: "address", type: "string", description: "Agent Ethereum address", required: true },
      { name: "isAlive", type: "boolean", description: "Whether the agent is alive", required: true },
      { name: "streak", type: "integer", description: "Current pulse streak count", required: true },
      { name: "lastPulse", type: "integer", description: "Unix timestamp of last pulse", required: true },
      { name: "hazardScore", type: "integer", description: "Hazard score 0–100 (100 = dead)", required: true },
      { name: "ttlSeconds", type: "integer", description: "Protocol TTL in seconds", required: true },
      { name: "source", type: "string", description: '"cache" or "chain"', required: true },
      { name: "updatedAt", type: "integer", description: "Response timestamp", required: true },
    ],
    responseExample: JSON.stringify(
      {
        address: EXAMPLE_ADDR,
        isAlive: true,
        streak: 42,
        lastPulse: 1738900000,
        hazardScore: 15,
        ttlSeconds: 86400,
        source: "cache",
        updatedAt: 1738901200,
      },
      null,
      2
    ),
    curlExample: `curl -s "${BASE}/api/status/${EXAMPLE_ADDR}" | jq`,
    errorCodes: [
      { code: 400, description: "Invalid address format" },
      { code: 429, description: "Rate limit exceeded (see X-RateLimit-* headers)" },
      { code: 503, description: "Failed to fetch from chain" },
    ],
  },

  // ── Free: pulse feed ──
  {
    id: "v1-pulse-feed",
    method: "GET",
    path: "/api/pulse-feed",
    summary: "Get pulse event feed",
    description:
      "Returns paginated Pulse events from thirdweb Insight. Primary feed for leaderboard, analytics, and UI. Supports filtering by agent and sorting.",
    tier: "free",
    cacheTTL: "60 s",
    params: [
      { name: "agent", in: "query", type: "string (0x…)", required: false, description: "Filter by agent address" },
      { name: "limit", in: "query", type: "integer", required: false, description: "Results per page (1–100)", default: "50" },
      { name: "page", in: "query", type: "integer", required: false, description: "Page number (0-indexed)", default: "0" },
      { name: "sort", in: "query", type: "string", required: false, description: '"asc" or "desc"', default: "desc" },
    ],
    responseFields: [
      { name: "data", type: "array", description: "Array of pulse event objects", required: true },
      { name: "data[].agent", type: "string", description: "Agent address" },
      { name: "data[].amount", type: "string", description: "Pulse amount in wei" },
      { name: "data[].timestamp", type: "integer", description: "Unix timestamp" },
      { name: "data[].streak", type: "integer", description: "Streak at pulse time" },
      { name: "data[].blockNumber", type: "integer", description: "Block number" },
      { name: "data[].transactionHash", type: "string", description: "Transaction hash" },
      { name: "pagination", type: "object", description: "Pagination metadata", required: true },
      { name: "pagination.totalEvents", type: "integer", description: "Total matching events" },
      { name: "pagination.hasNextPage", type: "boolean", description: "More pages available" },
      { name: "meta", type: "object", description: "Request metadata", required: true },
      { name: "meta.requestId", type: "string", description: "UUID for this request" },
      { name: "meta.durationMs", type: "integer", description: "Server-side latency" },
    ],
    responseExample: JSON.stringify(
      {
        data: [
          {
            agent: EXAMPLE_ADDR,
            amount: "1000000000000000000",
            timestamp: 1738900000,
            streak: 42,
            blockNumber: 28000000,
            transactionHash: "0xabc…def",
            logIndex: 0,
            timestampFormatted: "2026-02-07T12:00:00.000Z",
          },
        ],
        pagination: {
          page: 0,
          limit: 50,
          totalEvents: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        meta: {
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          durationMs: 45,
          timestamp: 1738901200,
        },
      },
      null,
      2
    ),
    curlExample: `# Latest 10 pulses
curl -s "${BASE}/api/pulse-feed?limit=10" | jq

# Filter by agent
curl -s "${BASE}/api/pulse-feed?agent=${EXAMPLE_ADDR}&limit=5" | jq`,
    errorCodes: [
      { code: 400, description: "Invalid query parameters" },
      { code: 500, description: "Internal server error" },
      { code: 502, description: "Upstream Insight API error" },
    ],
  },

  // ── Free: protocol health ──
  {
    id: "v1-protocol-health",
    method: "GET",
    path: "/api/protocol-health",
    summary: "Protocol health check",
    description:
      "Returns protocol health status including pause state, total agent count, and service health for KV and RPC backends. Use this for monitoring dashboards.",
    tier: "free",
    cacheTTL: "10 s",
    responseFields: [
      { name: "paused", type: "boolean", description: "Whether the protocol is paused", required: true },
      { name: "totalAgents", type: "integer", description: "Total registered agents", required: true },
      { name: "kvHealthy", type: "boolean", description: "Vercel KV health", required: true },
      { name: "rpcHealthy", type: "boolean", description: "Base RPC health", required: true },
      { name: "status", type: "string", description: '"healthy", "degraded", or "unhealthy"', required: true },
    ],
    responseExample: JSON.stringify(
      {
        paused: false,
        totalAgents: 128,
        kvHealthy: true,
        rpcHealthy: true,
        status: "healthy",
      },
      null,
      2
    ),
    curlExample: `curl -s "${BASE}/api/protocol-health" | jq`,
    errorCodes: [
      { code: 429, description: "Rate limit exceeded" },
      { code: 503, description: "Service unavailable" },
    ],
  },

  // ── Paid: reliability ──
  {
    id: "v2-reliability",
    method: "GET",
    path: "/api/v2/agent/{address}/reliability",
    summary: "Agent reliability metrics",
    description:
      "Returns computed reliability metrics: reliability score (0–100), uptime percentage, jitter, and hazard rate. Derived from on-chain data via the PulseRegistry contract.",
    tier: "paid",
    price: "$0.01 USDC",
    cacheTTL: "5 min (300 s)",
    params: [
      {
        name: "address",
        in: "path",
        type: "string (0x…)",
        required: true,
        description: "Ethereum address of the agent",
      },
    ],
    responseFields: [
      { name: "agent", type: "string", description: "Agent address", required: true },
      { name: "reliabilityScore", type: "integer", description: "Score 0–100", required: true },
      { name: "uptimePercent", type: "number", description: "Uptime as a percentage", required: true },
      { name: "jitter", type: "number", description: "Pulse regularity metric (lower = better)", required: true },
      { name: "hazardRate", type: "integer", description: "On-chain hazard score 0–100", required: true },
      { name: "lastUpdated", type: "string", description: "ISO 8601 timestamp" },
      { name: "_tier", type: "string", description: '"free" (cached) or "paid" (fresh)' },
      { name: "_cached", type: "boolean", description: "Whether this was served from cache" },
      { name: "_payment", type: "object", description: "Payment proof (payer, amount, timestamp)" },
    ],
    responseExample: JSON.stringify(
      {
        agent: EXAMPLE_ADDR,
        reliabilityScore: 87,
        uptimePercent: 94.5,
        jitter: 12.3,
        hazardRate: 15,
        lastUpdated: "2026-02-07T12:00:00.000Z",
        _tier: "paid",
        _payment: {
          payer: "0xYourWalletAddress…",
          amount: "10000",
          timestamp: "2026-02-07T12:00:00.000Z",
        },
      },
      null,
      2
    ),
    curlExample: `# First call without payment → 402
curl -s -w "\\nHTTP %{http_code}" \\
  "${BASE}/api/v2/agent/${EXAMPLE_ADDR}/reliability"

# With x402 payment header (see Payment Flow below)
curl -s -H "X-PAYMENT: <base64-payment-proof>" \\
  "${BASE}/api/v2/agent/${EXAMPLE_ADDR}/reliability" | jq`,
    errorCodes: [
      { code: 400, description: "Invalid agent address" },
      { code: 402, description: "Payment required (x402 challenge)" },
      { code: 429, description: "Rate limit exceeded (60 req/min for free tier)" },
    ],
  },

  // ── Paid: streak analysis ──
  {
    id: "v2-streak-analysis",
    method: "GET",
    path: "/api/v2/agent/{address}/streak-analysis",
    summary: "Streak analysis",
    description:
      "Deep streak analysis including current/max streak, consistency grade (A–F), time remaining until streak breaks, and next pulse deadline.",
    tier: "paid",
    price: "$0.008 USDC",
    cacheTTL: "5 min (300 s)",
    params: [
      {
        name: "address",
        in: "path",
        type: "string (0x…)",
        required: true,
        description: "Ethereum address of the agent",
      },
    ],
    responseFields: [
      { name: "agent", type: "string", description: "Agent address", required: true },
      { name: "currentStreak", type: "integer", description: "Current consecutive streak", required: true },
      { name: "maxStreak", type: "integer", description: "Estimated maximum streak", required: true },
      { name: "streakConsistency", type: "integer", description: "Consistency score 0–100", required: true },
      { name: "consistencyGrade", type: "string", description: "Letter grade: A, B, C, D, or F", required: true },
      { name: "timeToBreak", type: "integer | null", description: "Seconds until streak breaks (null if dead)", required: true },
      { name: "lastPulseAt", type: "integer", description: "Unix timestamp of last pulse", required: true },
      { name: "nextPulseDeadline", type: "integer", description: "Unix timestamp when next pulse must land", required: true },
    ],
    responseExample: JSON.stringify(
      {
        agent: EXAMPLE_ADDR,
        currentStreak: 42,
        maxStreak: 50,
        streakConsistency: 78,
        consistencyGrade: "B",
        timeToBreak: 43200,
        lastPulseAt: 1738900000,
        nextPulseDeadline: 1738986400,
        _tier: "paid",
      },
      null,
      2
    ),
    curlExample: `curl -s -H "X-PAYMENT: <base64-payment-proof>" \\
  "${BASE}/api/v2/agent/${EXAMPLE_ADDR}/streak-analysis" | jq`,
    errorCodes: [
      { code: 400, description: "Invalid agent address" },
      { code: 402, description: "Payment required (x402 challenge)" },
      { code: 429, description: "Rate limit exceeded" },
    ],
  },

  // ── Paid: uptime metrics ──
  {
    id: "v2-uptime-metrics",
    method: "GET",
    path: "/api/v2/agent/{address}/uptime-metrics",
    summary: "Uptime metrics",
    description:
      "Detailed uptime metrics including uptime percentage, downtime event count, average downtime duration, and the observation window.",
    tier: "paid",
    price: "$0.01 USDC",
    cacheTTL: "15 min (900 s)",
    params: [
      {
        name: "address",
        in: "path",
        type: "string (0x…)",
        required: true,
        description: "Ethereum address of the agent",
      },
    ],
    responseFields: [
      { name: "address", type: "string", description: "Agent address", required: true },
      { name: "uptimePercent", type: "number", description: "Uptime as a percentage", required: true },
      { name: "downtimeEvents", type: "integer", description: "Number of downtime events", required: true },
      { name: "averageDowntime", type: "integer", description: "Average downtime in seconds", required: true },
      { name: "totalUptime", type: "integer", description: "Total uptime in seconds", required: true },
      { name: "totalDowntime", type: "integer", description: "Total downtime in seconds", required: true },
      { name: "lastDowntime", type: "integer | undefined", description: "Unix timestamp of last downtime" },
      { name: "metricsPeriod.from", type: "integer", description: "Observation window start (unix)", required: true },
      { name: "metricsPeriod.to", type: "integer", description: "Observation window end (unix)", required: true },
    ],
    responseExample: JSON.stringify(
      {
        address: EXAMPLE_ADDR,
        uptimePercent: 97.5,
        downtimeEvents: 3,
        averageDowntime: 1800,
        totalUptime: 604800,
        totalDowntime: 5400,
        lastDowntime: 1738800000,
        metricsPeriod: { from: 1738300000, to: 1738900000 },
        _tier: "paid",
      },
      null,
      2
    ),
    curlExample: `curl -s -H "X-PAYMENT: <base64-payment-proof>" \\
  "${BASE}/api/v2/agent/${EXAMPLE_ADDR}/uptime-metrics" | jq`,
    errorCodes: [
      { code: 400, description: "Invalid Ethereum address" },
      { code: 402, description: "Payment required (x402 challenge)" },
      { code: 404, description: "Agent not found" },
      { code: 429, description: "Rate limit exceeded" },
    ],
  },

  // ── Paid: submit pulse ──
  {
    id: "v1-pulse",
    method: "POST",
    path: "/api/pulse",
    summary: "Submit pulse signal",
    description:
      "Submit an Agent Pulse on-chain. Requires x402 payment using USDC. The first request without payment returns 402 with payment requirements; the client completes payment and retries with proof.",
    tier: "paid",
    price: "Dynamic (USDC)",
    bodySchema: [
      { name: "agent", type: "string", description: "Agent Ethereum address", required: true },
    ],
    responseFields: [
      { name: "success", type: "boolean", description: "Whether the pulse was submitted", required: true },
      { name: "agent", type: "string", description: "Agent address", required: true },
      { name: "paidAmount", type: "string", description: "Amount paid in wei", required: true },
    ],
    responseExample: JSON.stringify(
      {
        success: true,
        agent: EXAMPLE_ADDR,
        paidAmount: "1000000",
      },
      null,
      2
    ),
    curlExample: `# Step 1: Get payment challenge
curl -s -X POST "${BASE}/api/pulse" \\
  -H "Content-Type: application/json" \\
  -d '{"agent":"${EXAMPLE_ADDR}"}' \\
  -w "\\nHTTP %{http_code}"

# Step 2: Submit with payment proof
curl -s -X POST "${BASE}/api/pulse" \\
  -H "Content-Type: application/json" \\
  -H "X-PAYMENT: <base64-payment-proof>" \\
  -d '{"agent":"${EXAMPLE_ADDR}"}' | jq`,
    errorCodes: [
      { code: 400, description: "Missing agent address" },
      { code: 402, description: "Payment required (x402 flow)" },
      { code: 503, description: "x402 endpoint not configured" },
    ],
  },

  // ── Free: docs ──
  {
    id: "v1-docs",
    method: "GET",
    path: "/api/docs",
    summary: "OpenAPI specification",
    description: "Returns the full OpenAPI 3.1.0 JSON specification for machine consumption. Use this endpoint to auto-generate client SDKs.",
    tier: "free",
    cacheTTL: "1 hour",
    responseFields: [
      { name: "openapi", type: "string", description: "OpenAPI version (3.1.0)", required: true },
      { name: "info", type: "object", description: "API metadata (title, version, description)", required: true },
      { name: "paths", type: "object", description: "All endpoint definitions", required: true },
      { name: "components", type: "object", description: "Shared schemas and security schemes", required: true },
    ],
    responseExample: `{
  "openapi": "3.1.0",
  "info": { "title": "Agent Pulse API", "version": "2.0.0" },
  "paths": { ... },
  "components": { ... }
}`,
    curlExample: `curl -s "${BASE}/api/docs" | jq .info`,
    errorCodes: [],
  },
];

// ────────────────────────────────────────────
// Components
// ────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button onClick={handleCopy} style={styles.copyBtn} title="Copy to clipboard">
      {copied ? "✓ copied" : "⎘ copy"}
    </button>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "#4ade80",
    POST: "#facc15",
    HEAD: "#60a5fa",
  };
  return (
    <span
      style={{
        ...styles.badge,
        borderColor: colors[method] || "#888",
        color: colors[method] || "#888",
      }}
    >
      {method}
    </span>
  );
}

function TierBadge({ tier, price }: { tier: "free" | "paid"; price?: string }) {
  return (
    <span
      style={{
        ...styles.badge,
        borderColor: tier === "free" ? "#4ade80" : "#facc15",
        color: tier === "free" ? "#4ade80" : "#facc15",
        marginLeft: 8,
      }}
    >
      {tier === "free" ? "FREE" : `PAID · ${price}`}
    </span>
  );
}

function TryItButton({ endpoint }: { endpoint: EndpointDef }) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Only allow "Try it" for free GET endpoints
  if (endpoint.tier !== "free" || endpoint.method !== "GET") return null;

  const handleTry = async () => {
    setLoading(true);
    setResult(null);
    try {
      // Build a relative URL for trying
      let url = endpoint.path;
      // Replace {address} with a known test address or first example
      url = url.replace("{address}", "0x0000000000000000000000000000000000000001");
      const res = await fetch(url);
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={handleTry} disabled={loading} style={styles.tryBtn}>
        {loading ? "⏳ loading…" : "▶ Try it live"}
      </button>
      {result && (
        <div style={{ position: "relative" }}>
          <CopyButton text={result} />
          <pre style={styles.codeBlock}>{result}</pre>
        </div>
      )}
    </div>
  );
}

function EndpointCard({ ep }: { ep: EndpointDef }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={styles.card} id={ep.id}>
      <button
        onClick={() => setOpen(!open)}
        style={styles.cardHeader}
        aria-expanded={open}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <MethodBadge method={ep.method} />
          <code style={styles.pathText}>{ep.path}</code>
          <TierBadge tier={ep.tier} price={ep.price} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={styles.summaryText}>{ep.summary}</span>
          <span style={{ color: "var(--green)", fontSize: 14 }}>
            {open ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {open && (
        <div style={styles.cardBody}>
          <p style={styles.description}>{ep.description}</p>

          {ep.cacheTTL && (
            <div style={styles.metaRow}>
              <span style={styles.metaLabel}>Cache TTL</span>
              <code style={styles.metaValue}>{ep.cacheTTL}</code>
            </div>
          )}

          {/* Parameters */}
          {ep.params && ep.params.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={styles.sectionTitle}>Parameters</h4>
              <div style={styles.table}>
                <div style={{ ...styles.tableRow, ...styles.tableHeader }}>
                  <span style={styles.cellName}>Name</span>
                  <span style={styles.cellType}>Type</span>
                  <span style={styles.cellIn}>In</span>
                  <span style={styles.cellReq}>Req</span>
                  <span style={styles.cellDesc}>Description</span>
                </div>
                {ep.params.map((p) => (
                  <div key={p.name} style={styles.tableRow}>
                    <code style={styles.cellName}>{p.name}</code>
                    <code style={styles.cellType}>{p.type}</code>
                    <span style={styles.cellIn}>{p.in}</span>
                    <span style={styles.cellReq}>{p.required ? "✓" : "—"}</span>
                    <span style={styles.cellDesc}>
                      {p.description}
                      {p.default && (
                        <span style={{ color: "var(--text-muted)" }}>
                          {" "}
                          (default: {p.default})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Request body */}
          {ep.bodySchema && ep.bodySchema.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={styles.sectionTitle}>Request Body (JSON)</h4>
              <div style={styles.table}>
                <div style={{ ...styles.tableRow, ...styles.tableHeader }}>
                  <span style={styles.cellName}>Field</span>
                  <span style={styles.cellType}>Type</span>
                  <span style={styles.cellReq}>Req</span>
                  <span style={styles.cellDesc}>Description</span>
                </div>
                {ep.bodySchema.map((f) => (
                  <div key={f.name} style={styles.tableRow}>
                    <code style={styles.cellName}>{f.name}</code>
                    <code style={styles.cellType}>{f.type}</code>
                    <span style={styles.cellReq}>{f.required ? "✓" : "—"}</span>
                    <span style={styles.cellDesc}>{f.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* curl example */}
          <div style={{ marginTop: 16 }}>
            <h4 style={styles.sectionTitle}>curl Example</h4>
            <div style={{ position: "relative" }}>
              <CopyButton text={ep.curlExample} />
              <pre style={styles.codeBlock}>{ep.curlExample}</pre>
            </div>
          </div>

          {/* Response schema */}
          <div style={{ marginTop: 16 }}>
            <h4 style={styles.sectionTitle}>Response Schema</h4>
            <div style={styles.table}>
              <div style={{ ...styles.tableRow, ...styles.tableHeader }}>
                <span style={styles.cellName}>Field</span>
                <span style={styles.cellType}>Type</span>
                <span style={styles.cellReq}>Req</span>
                <span style={styles.cellDesc}>Description</span>
              </div>
              {ep.responseFields.map((f) => (
                <div key={f.name} style={styles.tableRow}>
                  <code style={styles.cellName}>{f.name}</code>
                  <code style={styles.cellType}>{f.type}</code>
                  <span style={styles.cellReq}>{f.required ? "✓" : "—"}</span>
                  <span style={styles.cellDesc}>{f.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Response example */}
          <div style={{ marginTop: 16 }}>
            <h4 style={styles.sectionTitle}>Response Example</h4>
            <div style={{ position: "relative" }}>
              <CopyButton text={ep.responseExample} />
              <pre style={styles.codeBlock}>{ep.responseExample}</pre>
            </div>
          </div>

          {/* Error codes */}
          {ep.errorCodes.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={styles.sectionTitle}>Error Responses</h4>
              <div style={styles.table}>
                <div style={{ ...styles.tableRow, ...styles.tableHeader }}>
                  <span style={{ ...styles.cellName, flex: "0 0 80px" }}>Code</span>
                  <span style={styles.cellDesc}>Description</span>
                </div>
                {ep.errorCodes.map((e) => (
                  <div key={e.code} style={styles.tableRow}>
                    <code style={{ ...styles.cellName, flex: "0 0 80px", color: "var(--error)" }}>
                      {e.code}
                    </code>
                    <span style={styles.cellDesc}>{e.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Try it */}
          <TryItButton endpoint={ep} />
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function DocsPage() {
  const freeEndpoints = ENDPOINTS.filter((e) => e.tier === "free");
  const paidEndpoints = ENDPOINTS.filter((e) => e.tier === "paid");

  return (
    <main style={styles.main}>
      {/* Header */}
      <div style={styles.header}>
        <a href="/" style={styles.backLink}>← agent-pulse</a>
        <h1 style={styles.title}>
          <span style={{ color: "var(--green)" }}>API</span> Documentation
        </h1>
        <p style={styles.subtitle}>
          On-chain liveness signals for AI agents on Base.
          <br />
          Machine-readable spec:{" "}
          <a href="/api/docs" style={styles.link}>
            GET /api/docs
          </a>{" "}
          (OpenAPI 3.1.0)
        </p>
      </div>

      {/* Quick nav */}
      <nav style={styles.nav}>
        <span style={styles.navLabel}>Jump to:</span>
        <a href="#quickstart" style={styles.navLink}>Quick Start</a>
        <a href="#rate-limits" style={styles.navLink}>Rate Limits</a>
        <a href="#x402-flow" style={styles.navLink}>x402 Payment</a>
        <a href="#free-endpoints" style={styles.navLink}>Free Endpoints</a>
        <a href="#paid-endpoints" style={styles.navLink}>Paid Endpoints</a>
        <a href="#pricing" style={styles.navLink}>Pricing</a>
      </nav>

      {/* Quick start */}
      <section id="quickstart" style={styles.section}>
        <h2 style={styles.sectionHeading}>Quick Start</h2>
        <p style={styles.prose}>
          Check if an agent is alive in one curl:
        </p>
        <div style={{ position: "relative" }}>
          <CopyButton
            text={`curl -s "${BASE}/api/v2/agent/0xYOUR_AGENT_ADDRESS/alive" | jq`}
          />
          <pre style={styles.codeBlock}>
{`curl -s "${BASE}/api/v2/agent/0xYOUR_AGENT_ADDRESS/alive" | jq`}
          </pre>
        </div>
        <p style={styles.prose}>
          The <code style={styles.inlineCode}>/alive</code> endpoint is free, instant, and needs no
          authentication. For deeper analytics (reliability, streaks, uptime), v2 endpoints use{" "}
          <a href="#x402-flow" style={styles.link}>x402 micropayments</a> — your first call gets a
          402 with payment instructions; pay with USDC on Base and retry.
        </p>
      </section>

      {/* Base URL */}
      <section style={styles.section}>
        <h2 style={styles.sectionHeading}>Base URL</h2>
        <pre style={styles.codeBlock}>{BASE}</pre>
        <p style={styles.prose}>
          All paths below are relative to this base. Responses are JSON with{" "}
          <code style={styles.inlineCode}>Content-Type: application/json</code>.
          CORS is enabled on all endpoints.
        </p>
      </section>

      {/* Rate limits */}
      <section id="rate-limits" style={styles.section}>
        <h2 style={styles.sectionHeading}>Rate Limits</h2>
        <div style={styles.table}>
          <div style={{ ...styles.tableRow, ...styles.tableHeader }}>
            <span style={{ flex: 1 }}>Tier</span>
            <span style={{ flex: 1 }}>Limit</span>
            <span style={{ flex: 2 }}>Details</span>
          </div>
          <div style={styles.tableRow}>
            <span style={{ flex: 1 }}>Free (unauthenticated)</span>
            <code style={{ flex: 1, color: "var(--green)" }}>60 req / min</code>
            <span style={{ flex: 2, color: "var(--text-secondary)" }}>
              Per IP, sliding window. Exceeding returns 429 with{" "}
              <code style={styles.inlineCode}>Retry-After</code> header.
            </span>
          </div>
          <div style={styles.tableRow}>
            <span style={{ flex: 1 }}>Paid (x402)</span>
            <code style={{ flex: 1, color: "var(--green)" }}>Unlimited</code>
            <span style={{ flex: 2, color: "var(--text-secondary)" }}>
              Every request with a valid <code style={styles.inlineCode}>X-PAYMENT</code> header
              bypasses rate limits entirely.
            </span>
          </div>
        </div>
        <p style={styles.prose}>
          Rate-limit headers are included on every response:
        </p>
        <pre style={styles.codeBlock}>
{`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1738901260`}
        </pre>
      </section>

      {/* x402 payment flow */}
      <section id="x402-flow" style={styles.section}>
        <h2 style={styles.sectionHeading}>x402 Payment Flow</h2>
        <p style={styles.prose}>
          Paid endpoints implement the{" "}
          <a href="https://www.x402.org/" target="_blank" rel="noopener" style={styles.link}>
            x402 protocol
          </a>{" "}
          for per-request micropayments in USDC on Base. Here&apos;s how it works:
        </p>
        <div style={styles.flowDiagram}>
          <div style={styles.flowStep}>
            <span style={styles.flowNum}>1</span>
            <div>
              <strong style={{ color: "var(--green)" }}>Request without payment</strong>
              <p style={{ color: "var(--text-secondary)", marginTop: 4, fontSize: 13 }}>
                Call any paid endpoint normally. The server responds with{" "}
                <code style={styles.inlineCode}>402 Payment Required</code>.
              </p>
            </div>
          </div>
          <div style={styles.flowStep}>
            <span style={styles.flowNum}>2</span>
            <div>
              <strong style={{ color: "var(--green)" }}>Read payment requirements</strong>
              <p style={{ color: "var(--text-secondary)", marginTop: 4, fontSize: 13 }}>
                The 402 response includes the <code style={styles.inlineCode}>X-PAYMENT-REQUIRED</code>{" "}
                header with: amount, USDC token address, network (Base), and facilitator address.
              </p>
            </div>
          </div>
          <div style={styles.flowStep}>
            <span style={styles.flowNum}>3</span>
            <div>
              <strong style={{ color: "var(--green)" }}>Complete payment on-chain</strong>
              <p style={{ color: "var(--text-secondary)", marginTop: 4, fontSize: 13 }}>
                Sign and submit the USDC payment to the facilitator contract on Base.
                The thirdweb SDK handles this automatically with{" "}
                <code style={styles.inlineCode}>settlePayment()</code>.
              </p>
            </div>
          </div>
          <div style={styles.flowStep}>
            <span style={styles.flowNum}>4</span>
            <div>
              <strong style={{ color: "var(--green)" }}>Retry with proof</strong>
              <p style={{ color: "var(--text-secondary)", marginTop: 4, fontSize: 13 }}>
                Re-send the original request with the{" "}
                <code style={styles.inlineCode}>X-PAYMENT</code> header containing base64-encoded
                payment proof. The server verifies and returns data.
              </p>
            </div>
          </div>
        </div>

        <h3 style={{ ...styles.sectionTitle, marginTop: 20 }}>Example: TypeScript with thirdweb</h3>
        <div style={{ position: "relative" }}>
          <CopyButton
            text={`import { createThirdwebClient } from "thirdweb";
import { facilitator, settlePayment } from "thirdweb/x402";

const client = createThirdwebClient({ clientId: "YOUR_CLIENT_ID" });

// Step 1: Call the endpoint
const res = await fetch("${BASE}/api/v2/agent/0xAGENT/reliability");

if (res.status === 402) {
  // Step 2: Read payment requirements
  const paymentReq = res.headers.get("X-PAYMENT-REQUIRED");

  // Step 3: Settle payment
  const proof = await settlePayment(client, JSON.parse(paymentReq));

  // Step 4: Retry with proof
  const data = await fetch("${BASE}/api/v2/agent/0xAGENT/reliability", {
    headers: { "X-PAYMENT": proof },
  }).then(r => r.json());

  console.log(data);
}`}
          />
          <pre style={styles.codeBlock}>
{`import { createThirdwebClient } from "thirdweb";
import { facilitator, settlePayment } from "thirdweb/x402";

const client = createThirdwebClient({ clientId: "YOUR_CLIENT_ID" });

// Step 1: Call the endpoint
const res = await fetch("${BASE}/api/v2/agent/0xAGENT/reliability");

if (res.status === 402) {
  // Step 2: Read payment requirements
  const paymentReq = res.headers.get("X-PAYMENT-REQUIRED");

  // Step 3: Settle payment
  const proof = await settlePayment(client, JSON.parse(paymentReq));

  // Step 4: Retry with proof
  const data = await fetch("${BASE}/api/v2/agent/0xAGENT/reliability", {
    headers: { "X-PAYMENT": proof },
  }).then(r => r.json());

  console.log(data);
}`}
          </pre>
        </div>

        <h3 style={{ ...styles.sectionTitle, marginTop: 20 }}>Freshness Pricing</h3>
        <p style={styles.prose}>
          Paid endpoints use dynamic pricing based on data freshness:
        </p>
        <div style={styles.table}>
          <div style={{ ...styles.tableRow, ...styles.tableHeader }}>
            <span style={{ flex: 1 }}>Freshness</span>
            <span style={{ flex: 1 }}>Multiplier</span>
            <span style={{ flex: 2 }}>When</span>
          </div>
          <div style={styles.tableRow}>
            <span style={{ flex: 1 }}>Real-time</span>
            <code style={{ flex: 1, color: "var(--green)" }}>1.5×</code>
            <span style={{ flex: 2, color: "var(--text-secondary)" }}>
              Cache age = 0 (fresh data direct from chain)
            </span>
          </div>
          <div style={styles.tableRow}>
            <span style={{ flex: 1 }}>Cached</span>
            <code style={{ flex: 1, color: "var(--green)" }}>0.5×</code>
            <span style={{ flex: 2, color: "var(--text-secondary)" }}>
              Cache age ≤ 1 hour (recently computed)
            </span>
          </div>
          <div style={styles.tableRow}>
            <span style={{ flex: 1 }}>Base</span>
            <code style={{ flex: 1, color: "var(--green)" }}>1.0×</code>
            <span style={{ flex: 2, color: "var(--text-secondary)" }}>Default price</span>
          </div>
        </div>
      </section>

      {/* Pricing table */}
      <section id="pricing" style={styles.section}>
        <h2 style={styles.sectionHeading}>Pricing</h2>
        <div style={styles.table}>
          <div style={{ ...styles.tableRow, ...styles.tableHeader }}>
            <span style={{ flex: 2 }}>Endpoint</span>
            <span style={{ flex: 1 }}>Base Price</span>
            <span style={{ flex: 1 }}>Cache TTL</span>
          </div>
          <div style={styles.tableRow}>
            <code style={{ flex: 2, color: "var(--text-primary)" }}>/v2/agent/*/alive</code>
            <span style={{ flex: 1, color: "var(--green)" }}>FREE</span>
            <span style={{ flex: 1, color: "var(--text-secondary)" }}>30 s</span>
          </div>
          <div style={styles.tableRow}>
            <code style={{ flex: 2, color: "var(--text-primary)" }}>/v2/agent/*/reliability</code>
            <span style={{ flex: 1, color: "var(--green)" }}>$0.01 USDC</span>
            <span style={{ flex: 1, color: "var(--text-secondary)" }}>5 min</span>
          </div>
          <div style={styles.tableRow}>
            <code style={{ flex: 2, color: "var(--text-primary)" }}>/v2/agent/*/streak-analysis</code>
            <span style={{ flex: 1, color: "var(--green)" }}>$0.008 USDC</span>
            <span style={{ flex: 1, color: "var(--text-secondary)" }}>5 min</span>
          </div>
          <div style={styles.tableRow}>
            <code style={{ flex: 2, color: "var(--text-primary)" }}>/v2/agent/*/uptime-metrics</code>
            <span style={{ flex: 1, color: "var(--green)" }}>$0.01 USDC</span>
            <span style={{ flex: 1, color: "var(--text-secondary)" }}>15 min</span>
          </div>
          <div style={styles.tableRow}>
            <code style={{ flex: 2, color: "var(--text-primary)" }}>/api/pulse (POST)</code>
            <span style={{ flex: 1, color: "var(--green)" }}>Dynamic</span>
            <span style={{ flex: 1, color: "var(--text-secondary)" }}>—</span>
          </div>
        </div>
        <p style={styles.prose}>
          All prices are in USDC (6 decimal places) on Base L2. Payments are
          processed by the{" "}
          <a href="https://www.x402.org/" target="_blank" rel="noopener" style={styles.link}>
            x402 facilitator
          </a>
          .
        </p>
      </section>

      {/* Free endpoints */}
      <section id="free-endpoints" style={styles.section}>
        <h2 style={styles.sectionHeading}>
          Free Endpoints
          <span style={{ color: "var(--text-muted)", fontSize: 14, fontWeight: 400, marginLeft: 12 }}>
            No authentication required
          </span>
        </h2>
        {freeEndpoints.map((ep) => (
          <EndpointCard key={ep.id} ep={ep} />
        ))}
      </section>

      {/* Paid endpoints */}
      <section id="paid-endpoints" style={styles.section}>
        <h2 style={styles.sectionHeading}>
          Paid Endpoints
          <span style={{ color: "var(--text-muted)", fontSize: 14, fontWeight: 400, marginLeft: 12 }}>
            x402 micropayment in USDC
          </span>
        </h2>
        {paidEndpoints.map((ep) => (
          <EndpointCard key={ep.id} ep={ep} />
        ))}
      </section>

      {/* Contract info */}
      <section style={styles.section}>
        <h2 style={styles.sectionHeading}>Contract Addresses</h2>
        <div style={styles.table}>
          <div style={{ ...styles.tableRow, ...styles.tableHeader }}>
            <span style={{ flex: 1 }}>Contract</span>
            <span style={{ flex: 1 }}>Network</span>
            <span style={{ flex: 2 }}>Address</span>
          </div>
          <div style={styles.tableRow}>
            <span style={{ flex: 1 }}>PulseRegistry</span>
            <span style={{ flex: 1, color: "var(--text-secondary)" }}>Base Mainnet</span>
            <code style={{ flex: 2, color: "var(--green)", fontSize: 12, wordBreak: "break-all" }}>
              0xe61C615743A02983A46aFF66Db035297e8a43846
            </code>
          </div>
          <div style={styles.tableRow}>
            <span style={{ flex: 1 }}>USDC</span>
            <span style={{ flex: 1, color: "var(--text-secondary)" }}>Base Mainnet</span>
            <code style={{ flex: 2, color: "var(--green)", fontSize: 12, wordBreak: "break-all" }}>
              0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
            </code>
          </div>
          <div style={styles.tableRow}>
            <span style={{ flex: 1 }}>USDC</span>
            <span style={{ flex: 1, color: "var(--text-secondary)" }}>Base Sepolia</span>
            <code style={{ flex: 2, color: "var(--green)", fontSize: 12, wordBreak: "break-all" }}>
              0x036CbD53842c5426634e7929541eC2318f3dCF7e
            </code>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <p>
          Agent Pulse API v2 · Built on{" "}
          <a href="https://base.org" target="_blank" rel="noopener" style={styles.link}>
            Base
          </a>{" "}
          · Powered by{" "}
          <a href="https://www.x402.org/" target="_blank" rel="noopener" style={styles.link}>
            x402
          </a>
        </p>
        <p style={{ color: "var(--text-muted)", marginTop: 4, fontSize: 12 }}>
          OpenAPI spec: GET /api/docs · GitHub:{" "}
          <a
            href="https://github.com/consensus-hq/agent-pulse"
            target="_blank"
            rel="noopener"
            style={styles.link}
          >
            consensus-hq/agent-pulse
          </a>
        </p>
      </footer>
    </main>
  );
}

// ────────────────────────────────────────────
// Styles (CSS-in-JS using brand variables)
// ────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "40px 24px 80px",
    fontFamily: "'JetBrains Mono', monospace",
    position: "relative",
    zIndex: 1,
  },
  header: {
    marginBottom: 32,
  },
  backLink: {
    color: "var(--text-muted)",
    textDecoration: "none",
    fontSize: 13,
    display: "inline-block",
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
  },
  subtitle: {
    color: "var(--text-secondary)",
    fontSize: 14,
    marginTop: 8,
    lineHeight: 1.6,
  },
  link: {
    color: "var(--green)",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
  nav: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    background: "var(--surface-1)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 6,
    marginBottom: 32,
    fontSize: 13,
  },
  navLabel: {
    color: "var(--text-muted)",
    marginRight: 4,
  },
  navLink: {
    color: "var(--green)",
    textDecoration: "none",
    padding: "2px 8px",
    borderRadius: 3,
    border: "1px solid var(--border-subtle)",
    transition: "border-color 0.2s",
  },
  section: {
    marginBottom: 40,
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: 16,
    paddingBottom: 8,
    borderBottom: "1px solid var(--border-subtle)",
  },
  prose: {
    color: "var(--text-secondary)",
    fontSize: 14,
    lineHeight: 1.7,
    marginBottom: 12,
  },
  inlineCode: {
    background: "var(--surface-2)",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 13,
    color: "var(--green)",
    border: "1px solid var(--border-subtle)",
  },
  codeBlock: {
    background: "var(--surface-0)",
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    padding: "14px 16px",
    fontSize: 13,
    lineHeight: 1.6,
    overflow: "auto",
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  copyBtn: {
    position: "absolute" as const,
    top: 8,
    right: 8,
    background: "var(--surface-2)",
    border: "1px solid var(--border-default)",
    color: "var(--text-secondary)",
    padding: "3px 10px",
    borderRadius: 4,
    fontSize: 11,
    cursor: "pointer",
    zIndex: 2,
    fontFamily: "'JetBrains Mono', monospace",
  },
  card: {
    border: "1px solid var(--border-subtle)",
    borderRadius: 6,
    marginBottom: 12,
    overflow: "hidden",
    background: "var(--surface-0)",
  },
  cardHeader: {
    width: "100%",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: 6,
    padding: "14px 16px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
    fontFamily: "'JetBrains Mono', monospace",
    color: "var(--text-primary)",
  },
  cardBody: {
    padding: "0 16px 16px",
    borderTop: "1px solid var(--border-subtle)",
  },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    border: "1px solid",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    fontFamily: "'JetBrains Mono', monospace",
  },
  pathText: {
    fontSize: 14,
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  summaryText: {
    fontSize: 13,
    color: "var(--text-secondary)",
    fontWeight: 400,
  },
  description: {
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.7,
    marginTop: 12,
    marginBottom: 8,
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    fontSize: 13,
  },
  metaLabel: {
    color: "var(--text-muted)",
  },
  metaValue: {
    color: "var(--green)",
    background: "var(--surface-2)",
    padding: "1px 6px",
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--green-bright)",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  table: {
    border: "1px solid var(--border-subtle)",
    borderRadius: 6,
    overflow: "hidden",
  },
  tableHeader: {
    background: "var(--surface-1)",
    fontWeight: 600,
    fontSize: 11,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  tableRow: {
    display: "flex",
    alignItems: "flex-start",
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    fontSize: 13,
    gap: 8,
    color: "var(--text-primary)",
  },
  cellName: { flex: "0 0 160px", color: "var(--text-primary)", fontWeight: 500 },
  cellType: { flex: "0 0 120px", color: "var(--green-dim)", fontSize: 12 },
  cellIn: { flex: "0 0 60px", color: "var(--text-muted)", fontSize: 12 },
  cellReq: { flex: "0 0 40px", color: "var(--green)", textAlign: "center" as const },
  cellDesc: { flex: 1, color: "var(--text-secondary)", lineHeight: 1.5 },
  flowDiagram: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 0,
    margin: "16px 0",
  },
  flowStep: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: "14px 16px",
    borderLeft: "2px solid var(--green-dim)",
    fontSize: 14,
  },
  flowNum: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "var(--surface-2)",
    border: "1px solid var(--green-dim)",
    color: "var(--green)",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  tryBtn: {
    background: "var(--surface-2)",
    border: "1px solid var(--green-dim)",
    color: "var(--green)",
    padding: "6px 16px",
    borderRadius: 4,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
  },
  footer: {
    marginTop: 60,
    padding: "20px 0",
    borderTop: "1px solid var(--border-subtle)",
    textAlign: "center" as const,
    color: "var(--text-secondary)",
    fontSize: 13,
  },
};
