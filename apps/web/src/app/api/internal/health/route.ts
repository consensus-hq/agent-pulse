import { NextRequest, NextResponse } from "next/server";
import { MetricsCollector } from "@/lib/metrics";

export const runtime = "nodejs";

/**
 * GET /api/internal/health
 * 
 * Internal Health & Metrics Endpoint.
 * Provides visibility into indexer status, API usage, and cache performance.
 * NOT gated by x402.
 */
export async function GET(_request: NextRequest) {
  try {
    const metrics = await MetricsCollector.getMetrics();
    
    return NextResponse.json(metrics, {
      status: metrics.status === "unhealthy" ? 503 : 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      }
    });
  } catch (error) {
    console.error("Health check failed:", error);
    
    return NextResponse.json({
      status: "unhealthy",
      error: "Failed to fetch metrics"
    }, { status: 500 });
  }
}
