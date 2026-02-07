import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * OpenAPI 3.1.0 specification for Agent Pulse API
 * Returns JSON documentation for all API endpoints
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const openApiSpec = {
    openapi: "3.1.0",
    info: {
      title: "Agent Pulse API",
      description: "On-chain liveness signal API for AI agents on Base chain",
      version: "1.0.0",
    },
    servers: [
      {
        url: "/api",
        description: "Base API endpoint",
      },
    ],
    paths: {
      "/status/{address}": {
        get: {
          summary: "Get agent status",
          description: "Returns the liveness status, streak, hazard score, and last pulse timestamp for a specific agent address",
          operationId: "getAgentStatus",
          parameters: [
            {
              name: "address",
              in: "path",
              required: true,
              description: "Ethereum address of the agent (0x... format)",
              schema: {
                type: "string",
                pattern: "^0x[a-fA-F0-9]{40}$",
              },
            },
          ],
          responses: {
            "200": {
              description: "Agent status retrieved successfully",
              headers: {
                "X-RateLimit-Remaining": {
                  description: "Remaining requests in current window",
                  schema: { type: "integer" },
                },
                "X-Cache-Status": {
                  description: "Cache status (HIT or MISS)",
                  schema: { type: "string", enum: ["HIT", "MISS"] },
                },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      address: { type: "string", description: "Agent Ethereum address" },
                      isAlive: { type: "boolean", description: "Whether the agent is currently alive" },
                      streak: { type: "integer", description: "Current pulse streak count" },
                      lastPulse: { type: "integer", description: "Unix timestamp of last pulse" },
                      hazardScore: { type: "integer", description: "Hazard score from 0-100 (100 = dead)" },
                      ttlSeconds: { type: "integer", description: "Protocol TTL in seconds" },
                      source: { type: "string", enum: ["cache", "chain"], description: "Data source" },
                      updatedAt: { type: "integer", description: "Response timestamp" },
                    },
                    required: ["address", "isAlive", "streak", "lastPulse", "hazardScore", "ttlSeconds", "source", "updatedAt"],
                  },
                },
              },
            },
            "400": {
              description: "Invalid address format",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      status: { type: "string" },
                    },
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              headers: {
                "X-RateLimit-Limit": { schema: { type: "integer" } },
                "X-RateLimit-Remaining": { schema: { type: "integer" } },
                "X-RateLimit-Reset": { schema: { type: "integer" } },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      status: { type: "string" },
                    },
                  },
                },
              },
            },
            "503": {
              description: "Failed to fetch from chain",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      status: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/pulse-feed": {
        get: {
          summary: "Get pulse event feed",
          description: "Returns paginated Pulse events using thirdweb Insight API. This is the primary feed for UI, leaderboard, and analytics.",
          operationId: "getPulseFeed",
          parameters: [
            {
              name: "agent",
              in: "query",
              description: "Filter by specific agent address (optional)",
              schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
            },
            {
              name: "limit",
              in: "query",
              description: "Number of results (1-100, default 50)",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
            {
              name: "page",
              in: "query",
              description: "Page number (0-indexed, max 1000)",
              schema: { type: "integer", minimum: 0, maximum: 1000, default: 0 },
            },
            {
              name: "sort",
              in: "query",
              description: "Sort order",
              schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
            },
          ],
          responses: {
            "200": {
              description: "Feed retrieved successfully",
              headers: {
                "Cache-Control": { description: "Caching directives", schema: { type: "string" } },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            agent: { type: "string", description: "Agent address" },
                            amount: { type: "string", description: "Pulse amount in wei" },
                            timestamp: { type: "integer", description: "Unix timestamp" },
                            streak: { type: "integer", description: "Current streak at pulse time" },
                            blockNumber: { type: "integer", description: "Block number" },
                            transactionHash: { type: "string", description: "Transaction hash" },
                            logIndex: { type: "integer", description: "Log index" },
                            timestampFormatted: { type: "string", description: "ISO 8601 formatted timestamp" },
                          },
                          required: ["agent", "amount", "timestamp", "streak", "blockNumber", "transactionHash", "logIndex", "timestampFormatted"],
                        },
                      },
                      pagination: {
                        type: "object",
                        properties: {
                          page: { type: "integer" },
                          limit: { type: "integer" },
                          totalEvents: { type: "integer" },
                          totalPages: { type: "integer" },
                          hasNextPage: { type: "boolean" },
                          hasPreviousPage: { type: "boolean" },
                        },
                        required: ["page", "limit", "totalEvents", "totalPages", "hasNextPage", "hasPreviousPage"],
                      },
                      meta: {
                        type: "object",
                        properties: {
                          requestId: { type: "string", format: "uuid" },
                          durationMs: { type: "integer" },
                          timestamp: { type: "integer" },
                        },
                        required: ["requestId", "durationMs", "timestamp"],
                      },
                    },
                    required: ["data", "pagination", "meta"],
                  },
                },
              },
            },
            "400": {
              description: "Invalid query parameters",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      requestId: { type: "string" },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Internal server error",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      message: { type: "string" },
                      requestId: { type: "string" },
                      durationMs: { type: "integer" },
                    },
                  },
                },
              },
            },
            "502": {
              description: "Upstream API error from Insight",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      message: { type: "string" },
                      requestId: { type: "string" },
                      durationMs: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        options: {
          summary: "CORS preflight",
          description: "Handle CORS preflight requests",
          operationId: "pulseFeedOptions",
          responses: {
            "204": {
              description: "CORS preflight successful",
            },
          },
        },
      },
      "/pulse": {
        post: {
          summary: "Submit pulse signal",
          description: "Submit an Agent Pulse signal. Requires x402 payment using $PULSE utility token. The endpoint implements the x402 Payment Required flow: first request returns 402 with payment requirements, client completes payment and retries with proof.",
          operationId: "submitPulse",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    agent: { type: "string", description: "Agent Ethereum address" },
                  },
                  required: ["agent"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Pulse submitted successfully (after payment verification)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      agent: { type: "string", description: "Agent address" },
                      paidAmount: { type: "string", description: "Amount paid in wei" },
                    },
                    required: ["success", "agent", "paidAmount"],
                  },
                },
              },
            },
            "400": {
              description: "Missing agent address",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "402": {
              description: "Payment Required - x402 payment flow initiated. Response includes X-PAYMENT-REQUIRED header with payment details. Client must complete payment and retry with X-PAYMENT-RESPONSE header.",
              headers: {
                "X-PAYMENT-REQUIRED": {
                  description: "Payment requirements including amount, asset, and network",
                  schema: { type: "string" },
                },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      paymentRequired: { type: "boolean" },
                    },
                  },
                },
              },
            },
            "503": {
              description: "x402 endpoint not configured",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/protocol-health": {
        get: {
          summary: "Get protocol health",
          description: "Returns protocol health status including pause state, total agents, and service health (KV and RPC)",
          operationId: "getProtocolHealth",
          responses: {
            "200": {
              description: "Health status retrieved",
              headers: {
                "X-RateLimit-Remaining": { schema: { type: "integer" } },
                "X-KV-Latency": { schema: { type: "integer" } },
                "X-RPC-Latency": { schema: { type: "integer" } },
                "X-Data-Source": { schema: { type: "string", enum: ["kv", "chain"] } },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      paused: { type: "boolean", description: "Whether protocol is paused" },
                      totalAgents: { type: "integer", description: "Total registered agents" },
                      kvHealthy: { type: "boolean", description: "KV store health status" },
                      rpcHealthy: { type: "boolean", description: "RPC health status" },
                      status: { type: "string", enum: ["healthy", "degraded", "unhealthy"], description: "Overall health status" },
                    },
                    required: ["paused", "totalAgents", "kvHealthy", "rpcHealthy", "status"],
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              headers: {
                "X-RateLimit-Limit": { schema: { type: "integer" } },
                "X-RateLimit-Remaining": { schema: { type: "integer" } },
                "X-RateLimit-Reset": { schema: { type: "integer" } },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "503": {
              description: "Service unavailable or unhealthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      paused: { type: "boolean" },
                      totalAgents: { type: "integer" },
                      kvHealthy: { type: "boolean" },
                      rpcHealthy: { type: "boolean" },
                      status: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/defi": {
        get: {
          summary: "DeFi actions",
          description: "Proxy to HeyElsa DeFi API for price and portfolio queries",
          operationId: "defiAction",
          parameters: [
            {
              name: "action",
              in: "query",
              required: true,
              description: "Action to perform",
              schema: { type: "string", enum: ["price", "portfolio"] },
            },
          ],
          responses: {
            "200": {
              description: "DeFi data retrieved",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
            "400": {
              description: "Missing or unsupported action",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Server configuration error or upstream failure",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      details: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/pulse-webhook": {
        get: {
          summary: "Webhook health check",
          description: "Health check endpoint for the pulse webhook",
          operationId: "webhookHealth",
          responses: {
            "200": {
              description: "Webhook healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", enum: ["healthy"] },
                      endpoint: { type: "string" },
                      timestamp: { type: "integer" },
                    },
                    required: ["status", "endpoint", "timestamp"],
                  },
                },
              },
            },
            "503": {
              description: "Webhook unhealthy (KV connectivity issue)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", enum: ["unhealthy"] },
                      error: { type: "string" },
                    },
                    required: ["status", "error"],
                  },
                },
              },
            },
          },
        },
        post: {
          summary: "Receive pulse webhook",
          description: "Receives decoded Pulse events from thirdweb Insight webhooks and updates Vercel KV cache for real-time status updates",
          operationId: "receivePulseWebhook",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["event"] },
                    chainId: { type: "integer" },
                    contractAddress: { type: "string" },
                    signature: { type: "string" },
                    eventName: { type: "string" },
                    data: {
                      type: "object",
                      properties: {
                        agent: { type: "string" },
                        amount: { type: "string" },
                        timestamp: { type: "string" },
                        streak: { type: "string" },
                      },
                      required: ["agent", "amount", "timestamp", "streak"],
                    },
                    transaction: {
                      type: "object",
                      properties: {
                        hash: { type: "string" },
                        blockNumber: { type: "integer" },
                        blockHash: { type: "string" },
                        timestamp: { type: "integer" },
                        from: { type: "string" },
                        to: { type: "string" },
                      },
                      required: ["hash", "blockNumber", "blockHash", "timestamp", "from", "to"],
                    },
                    log: {
                      type: "object",
                      properties: {
                        address: { type: "string" },
                        topics: { type: "array", items: { type: "string" } },
                        data: { type: "string" },
                        logIndex: { type: "integer" },
                      },
                      required: ["address", "topics", "data", "logIndex"],
                    },
                    webhook: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        timestamp: { type: "string" },
                      },
                      required: ["id", "timestamp"],
                    },
                  },
                  required: ["type", "chainId", "contractAddress", "signature", "eventName", "data", "transaction", "log", "webhook"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Webhook processed successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      agent: { type: "string" },
                      timestamp: { type: "integer" },
                      requestId: { type: "string", format: "uuid" },
                      durationMs: { type: "integer" },
                    },
                    required: ["success", "agent", "timestamp", "requestId", "durationMs"],
                  },
                },
              },
            },
            "400": {
              description: "Validation error (invalid payload)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      requestId: { type: "string" },
                    },
                    required: ["error", "requestId"],
                  },
                },
              },
            },
            "500": {
              description: "Internal server error (triggers Insight retry)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      message: { type: "string" },
                      requestId: { type: "string" },
                    },
                    required: ["error", "message", "requestId"],
                  },
                },
              },
            },
          },
        },
      },
      "/anvil": {
        post: {
          summary: "Anvil RPC proxy",
          description: "Proxy requests to local Anvil testnet for time manipulation and testing",
          operationId: "anvilRpc",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    method: {
                      type: "string",
                      enum: ["evm_snapshot", "evm_revert", "evm_increaseTime", "evm_mine", "evm_setNextBlockTimestamp", "eth_blockNumber"],
                      description: "Anvil method to call",
                    },
                    params: {
                      type: "array",
                      description: "Method parameters",
                      items: {},
                    },
                  },
                  required: ["method"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "RPC call successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {},
                    },
                    required: ["result"],
                  },
                },
              },
            },
            "400": {
              description: "Unsupported method",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                    required: ["error"],
                  },
                },
              },
            },
            "500": {
              description: "RPC error",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                    required: ["error"],
                  },
                },
              },
            },
          },
        },
      },
      "/inbox-key": {
        post: {
          summary: "Issue inbox key",
          description: "Issue an API key for accessing an agent's inbox. Requires agent to be alive and valid signature.",
          operationId: "issueInboxKey",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    wallet: { type: "string", description: "Agent wallet address" },
                    signature: { type: "string", description: "Signed message" },
                    timestamp: { type: "integer", description: "Signature timestamp (within 10 min window)" },
                  },
                  required: ["wallet", "signature", "timestamp"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Key issued successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      key: { type: "string", description: "API key for inbox access" },
                      expiresAt: { type: "integer", description: "Key expiration timestamp" },
                      state: { type: "string", enum: ["alive", "stale", "unknown"] },
                      alive: { type: "boolean" },
                      lastPulseAt: { type: ["integer", "null"] },
                    },
                    required: ["ok", "key", "expiresAt", "state", "alive"],
                  },
                },
              },
            },
            "400": {
              description: "Invalid request (bad wallet, signature, or stale timestamp)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string", enum: ["invalid_wallet", "invalid_signature", "stale_signature"] },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
            "403": {
              description: "Agent not alive or not registered",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string", enum: ["not_alive", "not_registered"] },
                      state: { type: "string" },
                      alive: { type: "boolean" },
                      lastPulseAt: { type: ["integer", "null"] },
                    },
                    required: ["ok", "reason", "state", "alive"],
                  },
                },
              },
            },
            "409": {
              description: "Key already exists",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
            "429": {
              description: "Rate limited",
              headers: {
                "Retry-After": { schema: { type: "integer" } },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
          },
        },
      },
      "/inbox/{wallet}": {
        get: {
          summary: "List inbox tasks",
          description: "List all tasks for an agent's inbox",
          operationId: "listInboxTasks",
          parameters: [
            {
              name: "wallet",
              in: "path",
              required: true,
              description: "Agent wallet address",
              schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
            },
          ],
          security: [
            { bearerAuth: [] },
          ],
          responses: {
            "200": {
              description: "Tasks retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      tasks: {
                        type: "array",
                        items: { type: "object" },
                      },
                    },
                    required: ["ok", "tasks"],
                  },
                },
              },
            },
            "400": {
              description: "Invalid wallet address",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized - missing or invalid bearer token",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
            "429": {
              description: "Rate limited",
              headers: {
                "Retry-After": { schema: { type: "integer" } },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
          },
        },
        post: {
          summary: "Add inbox task",
          description: "Add a task to an agent's inbox",
          operationId: "addInboxTask",
          parameters: [
            {
              name: "wallet",
              in: "path",
              required: true,
              description: "Agent wallet address",
              schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
            },
          ],
          security: [
            { bearerAuth: [] },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
          responses: {
            "200": {
              description: "Task added",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      task: { type: "object" },
                    },
                    required: ["ok", "task"],
                  },
                },
              },
            },
            "400": {
              description: "Invalid wallet",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
            "413": {
              description: "Payload too large (max 16KB)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
            "429": {
              description: "Rate limited",
              headers: {
                "Retry-After": { schema: { type: "integer" } },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
          },
        },
      },
      "/inbox/cleanup": {
        post: {
          summary: "Cleanup inbox store",
          description: "Admin endpoint to clean up expired inbox entries. Requires admin token.",
          operationId: "cleanupInbox",
          security: [
            { bearerAuth: [] },
          ],
          responses: {
            "200": {
              description: "Cleanup completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      cleaned: { type: "integer" },
                      errors: { type: "integer" },
                    },
                    required: ["ok"],
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
            "403": {
              description: "Admin disabled",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["ok", "reason"],
                  },
                },
              },
            },
          },
        },
      },
      "/docs": {
        get: {
          summary: "API Documentation",
          description: "Returns this OpenAPI 3.1.0 JSON specification. Interactive docs available at /docs.",
          operationId: "getApiDocs",
          tags: ["Status"],
          responses: {
            "200": {
              description: "OpenAPI specification",
              headers: {
                "Cache-Control": { description: "Caching directives", schema: { type: "string" } },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    description: "OpenAPI 3.1.0 specification object",
                  },
                },
              },
            },
          },
        },
      },
      "/v2/agent/{address}/alive": {
        get: {
          summary: "Check agent liveness (FREE)",
          description: "Binary liveness check — the GTM wedge. Returns whether an agent is alive on-chain, its streak, staleness, and TTL. No payment required.",
          operationId: "v2GetAgentAlive",
          tags: ["V2 Liveness"],
          parameters: [
            {
              name: "address",
              in: "path",
              required: true,
              description: "Ethereum address of the agent (0x...)",
              schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
            },
          ],
          responses: {
            "200": {
              description: "Liveness check result",
              headers: {
                "Cache-Control": { schema: { type: "string" } },
                "Access-Control-Allow-Origin": { schema: { type: "string" } },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      address: { type: "string", description: "Lowercased agent address" },
                      isAlive: { type: "boolean", description: "Whether the agent is currently alive on-chain" },
                      lastPulseTimestamp: { type: "integer", description: "Unix timestamp of last pulse" },
                      streak: { type: "integer", description: "Current consecutive pulse streak" },
                      staleness: { type: "number", description: "Seconds since last pulse (Infinity if never pulsed)" },
                      ttl: { type: "integer", description: "Protocol TTL in seconds (86400)" },
                      checkedAt: { type: "string", format: "date-time", description: "ISO 8601 timestamp of this check" },
                      note: { type: "string", description: "Present when agent is not found in registry" },
                    },
                    required: ["address", "isAlive", "lastPulseTimestamp", "streak", "staleness", "ttl", "checkedAt"],
                  },
                },
              },
            },
            "400": {
              description: "Invalid Ethereum address",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { error: { type: "string" } } },
                },
              },
            },
          },
        },
      },
      "/v2/agent/{address}/reliability": {
        get: {
          summary: "Agent reliability metrics (PAID — $0.01)",
          description: "Returns computed reliability metrics: reliability score (0-100), uptime percentage, jitter, and hazard rate. Requires x402 payment in USDC.",
          operationId: "v2GetAgentReliability",
          tags: ["V2 Analytics"],
          parameters: [
            {
              name: "address",
              in: "path",
              required: true,
              description: "Ethereum address of the agent",
              schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
            },
          ],
          responses: {
            "200": {
              description: "Reliability metrics (after x402 payment)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      agent: { type: "string" },
                      reliabilityScore: { type: "integer", minimum: 0, maximum: 100, description: "Reliability score 0-100" },
                      uptimePercent: { type: "number", description: "Uptime as a percentage" },
                      jitter: { type: "number", description: "Pulse regularity metric (lower = better)" },
                      hazardRate: { type: "integer", minimum: 0, maximum: 100, description: "On-chain hazard score" },
                      lastUpdated: { type: "string", format: "date-time" },
                      _tier: { type: "string", enum: ["free", "paid"] },
                      _cached: { type: "boolean" },
                      _payment: { "$ref": "#/components/schemas/PaymentMeta" },
                    },
                    required: ["agent", "reliabilityScore", "uptimePercent", "jitter", "hazardRate", "lastUpdated"],
                  },
                },
              },
            },
            "400": { description: "Invalid agent address" },
            "402": {
              description: "Payment required. Read X-PAYMENT-REQUIRED header for payment details.",
              headers: {
                "X-PAYMENT-REQUIRED": { description: "Payment amount and details", schema: { type: "string" } },
              },
            },
            "429": { description: "Rate limit exceeded (60 req/min free tier)" },
          },
        },
      },
      "/v2/agent/{address}/streak-analysis": {
        get: {
          summary: "Streak analysis (PAID — $0.008)",
          description: "Deep streak analysis: current/max streak, consistency grade (A-F), time to break, and next pulse deadline. Requires x402 payment.",
          operationId: "v2GetAgentStreakAnalysis",
          tags: ["V2 Analytics"],
          parameters: [
            {
              name: "address",
              in: "path",
              required: true,
              description: "Ethereum address of the agent",
              schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
            },
          ],
          responses: {
            "200": {
              description: "Streak analysis data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      agent: { type: "string" },
                      currentStreak: { type: "integer", description: "Current consecutive streak" },
                      maxStreak: { type: "integer", description: "Estimated maximum streak" },
                      streakConsistency: { type: "integer", minimum: 0, maximum: 100, description: "Consistency score" },
                      consistencyGrade: { type: "string", enum: ["A", "B", "C", "D", "F"], description: "Letter grade" },
                      timeToBreak: { type: ["integer", "null"], description: "Seconds until streak breaks (null if dead)" },
                      lastPulseAt: { type: "integer", description: "Unix timestamp of last pulse" },
                      nextPulseDeadline: { type: "integer", description: "Unix timestamp for next pulse deadline" },
                      _tier: { type: "string", enum: ["free", "paid"] },
                      _payment: { "$ref": "#/components/schemas/PaymentMeta" },
                    },
                    required: ["agent", "currentStreak", "maxStreak", "streakConsistency", "consistencyGrade", "timeToBreak", "lastPulseAt", "nextPulseDeadline"],
                  },
                },
              },
            },
            "400": { description: "Invalid agent address" },
            "402": { description: "Payment required (x402 challenge)" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/v2/agent/{address}/uptime-metrics": {
        get: {
          summary: "Uptime metrics (PAID — $0.01)",
          description: "Detailed uptime metrics: uptime percentage, downtime events, average downtime, and observation window. Requires x402 payment.",
          operationId: "v2GetAgentUptimeMetrics",
          tags: ["V2 Analytics"],
          parameters: [
            {
              name: "address",
              in: "path",
              required: true,
              description: "Ethereum address of the agent",
              schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
            },
          ],
          responses: {
            "200": {
              description: "Uptime metrics",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      address: { type: "string" },
                      uptimePercent: { type: "number", description: "Uptime as a percentage" },
                      downtimeEvents: { type: "integer", description: "Number of downtime events" },
                      averageDowntime: { type: "integer", description: "Average downtime in seconds" },
                      totalUptime: { type: "integer", description: "Total uptime in seconds" },
                      totalDowntime: { type: "integer", description: "Total downtime in seconds" },
                      lastDowntime: { type: "integer", description: "Unix timestamp of last downtime" },
                      metricsPeriod: {
                        type: "object",
                        properties: {
                          from: { type: "integer", description: "Observation window start" },
                          to: { type: "integer", description: "Observation window end" },
                        },
                        required: ["from", "to"],
                      },
                      _tier: { type: "string", enum: ["free", "paid"] },
                      _payment: { "$ref": "#/components/schemas/PaymentMeta" },
                    },
                    required: ["address", "uptimePercent", "downtimeEvents", "averageDowntime", "totalUptime", "totalDowntime", "metricsPeriod"],
                  },
                },
              },
            },
            "400": { description: "Invalid Ethereum address" },
            "402": { description: "Payment required (x402 challenge)" },
            "404": { description: "Agent not found" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Bearer token authentication for inbox endpoints",
        },
      },
    },
    tags: [
      { name: "Status", description: "Agent liveness status" },
      { name: "Feed", description: "Pulse event feed" },
      { name: "Pulse", description: "Pulse signal submission" },
      { name: "Protocol", description: "Protocol health" },
      { name: "DeFi", description: "DeFi integrations" },
      { name: "Webhook", description: "Webhook handlers" },
      { name: "Testing", description: "Testing utilities" },
      { name: "Inbox", description: "Agent inbox management" },
    ],
  };

  // Validate JSON is valid before returning
  try {
    JSON.stringify(openApiSpec);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate OpenAPI spec" },
      { status: 500 }
    );
  }

  return NextResponse.json(openApiSpec, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json",
    },
  });
}
