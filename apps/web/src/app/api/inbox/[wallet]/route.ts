import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { addTask, listTasks, verifyKey } from "../../../lib/inboxStore";

export const runtime = "nodejs";

const MAX_BODY_SIZE_BYTES = 16 * 1024; // 16KB max

// Rate limiting: max 60 requests per key per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

function getRateLimitKey(key: string): string {
  return key;
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  const mapKey = getRateLimitKey(key);
  const now = Date.now();
  
  // Clean up expired entries periodically
  if (rateLimitMap.size > 10000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (v.resetAt < now) {
        rateLimitMap.delete(k);
      }
    }
  }
  
  const record = rateLimitMap.get(mapKey);
  
  if (!record || record.resetAt < now) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(mapKey, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }
  
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count, resetAt: record.resetAt };
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  return token || null;
}

function unauthorized() {
  return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await context.params;
  const normalized = wallet?.trim() || "";
  
  if (!isAddress(normalized)) {
    return NextResponse.json(
      { ok: false, reason: "invalid_wallet" },
      { status: 400 }
    );
  }

  const token = getBearerToken(request);
  if (!token || !verifyKey(normalized, token)) {
    return unauthorized();
  }

  // Check rate limit
  const rateLimit = checkRateLimit(token);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000) },
      { 
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
        }
      }
    );
  }

  const tasks = listTasks(normalized);
  
  return NextResponse.json(
    { ok: true, tasks },
    {
      headers: {
        "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
      }
    }
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await context.params;
  const normalized = wallet?.trim() || "";
  
  if (!isAddress(normalized)) {
    return NextResponse.json(
      { ok: false, reason: "invalid_wallet" },
      { status: 400 }
    );
  }

  const token = getBearerToken(request);
  if (!token || !verifyKey(normalized, token)) {
    return unauthorized();
  }

  // Check rate limit
  const rateLimit = checkRateLimit(token);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000) },
      { 
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
        }
      }
    );
  }

  // Check body size
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_BODY_SIZE_BYTES) {
    return NextResponse.json(
      { ok: false, reason: "payload_too_large", maxSize: MAX_BODY_SIZE_BYTES },
      { status: 413 }
    );
  }

  let payload: unknown = {};
  try {
    // Also check actual body size during parsing
    const text = await request.text();
    if (text.length > MAX_BODY_SIZE_BYTES) {
      return NextResponse.json(
        { ok: false, reason: "payload_too_large", maxSize: MAX_BODY_SIZE_BYTES },
        { status: 413 }
      );
    }
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  const task = addTask(normalized, payload);
  
  return NextResponse.json(
    { ok: true, task },
    {
      headers: {
        "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
      }
    }
  );
}
