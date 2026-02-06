import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

export type CacheStatus = "HIT" | "MISS" | "BYPASS";

/**
 * Vercel KV cache wrapper with tiered TTLs
 * Cache key format: v2:{endpoint}:{address}:{params_hash}
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<{ data: T; age: number; status: CacheStatus }> {
  const startTime = Date.now();
  
  // Try to get from cache
  const cached = await kv.get<{ data: T; timestamp: number }>(key);
  
  if (cached) {
    const age = Math.floor((Date.now() - cached.timestamp) / 1000);
    return {
      data: cached.data,
      age,
      status: "HIT",
    };
  }

  // Cache miss
  const data = await fetchFn();
  const timestamp = Date.now();

  // Store in cache
  await kv.set(key, { data, timestamp }, { ex: ttlSeconds });

  return {
    data,
    age: 0,
    status: "MISS",
  };
}

/**
 * Creates a JSON response with cache headers
 */
export function createCachedResponse(
  data: any,
  status: CacheStatus,
  age: number
): NextResponse {
  return NextResponse.json(data, {
    headers: {
      "X-Cache-Status": status,
      "X-Cache-Age": String(age),
      "Cache-Control": `public, s-maxage=${60}, stale-while-revalidate=${300}`,
    },
  });
}

/**
 * Helper to generate consistent cache keys
 */
export function generateCacheKey(
  endpoint: string,
  address: string,
  params: Record<string, string | number | boolean | undefined> = {}
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .filter(k => params[k] !== undefined)
    .map(k => `${k}=${params[k]}`)
    .join("&");
  
  const hash = sortedParams ? Buffer.from(sortedParams).toString("base64").slice(0, 16) : "none";
  
  return `v2:${endpoint}:${address.toLowerCase()}:${hash}`;
}
