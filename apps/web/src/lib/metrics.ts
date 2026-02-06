import { kv } from "@vercel/kv";

/**
 * HealthResponse schema based on GAUGE requirements
 */
export interface HealthResponse {
  indexer: {
    last_indexed_block: number;
    blocks_behind: number;
    agents_tracked: number;
    agents_alive_24h: number;
  };
  api: {
    today_free_calls: number;
    today_paid_calls: number;
    today_revenue_usd: number;
    cache_hit_rate: number;
  };
  status: "healthy" | "degraded" | "unhealthy";
}

/**
 * MetricsCollector class
 * Tracks API usage, revenue, and cache performance using Vercel KV.
 * Daily rollover keys: metrics:YYYY-MM-DD:*
 */
export class MetricsCollector {
  private static getDateKey(date: Date = new Date()): string {
    return date.toISOString().split("T")[0];
  }

  private static getMetricsKey(dateKey: string, type: string): string {
    return `metrics:${dateKey}:${type}`;
  }

  /**
   * trackApiCall(endpoint, tier: 'free'|'paid', priceUsd?: number)
   */
  static async trackApiCall(
    endpoint: string,
    tier: 'free' | 'paid',
    priceUsd: number = 0
  ): Promise<void> {
    const dateKey = this.getDateKey();
    const type = tier === 'paid' ? "paid_calls" : "free_calls";
    const key = this.getMetricsKey(dateKey, type);
    const endpointKey = this.getMetricsKey(dateKey, `endpoint:${endpoint}`);

    const pipeline = kv.pipeline();
    pipeline.incr(key);
    pipeline.incr(endpointKey);
    
    if (tier === 'paid' && priceUsd > 0) {
      const revKey = this.getMetricsKey(dateKey, "revenue");
      // Store in micro-USD to avoid float issues in KV
      pipeline.incrby(revKey, Math.round(priceUsd * 1_000_000));
      pipeline.expire(revKey, 604800);
    }

    pipeline.expire(key, 604800);
    pipeline.expire(endpointKey, 604800);

    await pipeline.exec();
  }

  /**
   * Track an API call (Legacy/Compatibility)
   */
  static async trackCall(
    endpoint: string,
    isPaid: boolean = false,
    revenueMicroUsdc: number = 0
  ): Promise<void> {
    return this.trackApiCall(endpoint, isPaid ? 'paid' : 'free', revenueMicroUsdc / 1_000_000);
  }

  /**
   * trackCacheEvent(hit: boolean)
   */
  static async trackCacheEvent(hit: boolean): Promise<void> {
    const dateKey = this.getDateKey();
    const key = this.getMetricsKey(dateKey, hit ? "cache_hit" : "cache_miss");
    
    await kv.incr(key);
    await kv.expire(key, 604800);
  }

  /**
   * Track cache hit/miss (Legacy/Compatibility)
   */
  static async trackCache(hit: boolean): Promise<void> {
    return this.trackCacheEvent(hit);
  }

  /**
   * getMetrics(): Promise<HealthResponse>
   */
  static async getMetrics(): Promise<HealthResponse> {
    const dateKey = this.getDateKey();
    
    // 1. API & Cache Metrics
    const [free, paid, rev, hits, misses] = await Promise.all([
      kv.get<number>(this.getMetricsKey(dateKey, "free_calls")),
      kv.get<number>(this.getMetricsKey(dateKey, "paid_calls")),
      kv.get<number>(this.getMetricsKey(dateKey, "revenue")),
      kv.get<number>(this.getMetricsKey(dateKey, "cache_hit")),
      kv.get<number>(this.getMetricsKey(dateKey, "cache_miss")),
    ]);

    const totalCache = (hits || 0) + (misses || 0);
    const cache_hit_rate = totalCache > 0 ? (hits || 0) / totalCache : 0;

    // 2. Indexer Metrics (from global/latest keys)
    const last_indexed_block = await kv.get<number>("indexer:last_block") || 0;
    const blocks_behind = await kv.get<number>("metrics:indexer:blocks_behind") || 0;
    const agents_tracked = await kv.get<number>("indexer:agents_count") || 0;
    const agents_alive_24h = await kv.get<number>("indexer:agents_alive_24h") || 0;

    // 3. Status logic
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (blocks_behind > 500) {
      status = "unhealthy";
    } else if (blocks_behind > 100) {
      status = "degraded";
    }

    return {
      indexer: {
        last_indexed_block,
        blocks_behind,
        agents_tracked,
        agents_alive_24h,
      },
      api: {
        today_free_calls: free || 0,
        today_paid_calls: paid || 0,
        today_revenue_usd: (rev || 0) / 1_000_000,
        cache_hit_rate: Math.round(cache_hit_rate * 100) / 100,
      },
      status
    };
  }
}
