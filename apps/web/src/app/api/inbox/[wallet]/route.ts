import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { isAddress } from "viem";
import { addTask, listTasks, verifyKey } from "../../../lib/inboxStore";

export const runtime = "nodejs";

const GET_RATE_LIMIT_WINDOW_SECONDS = 60;
const GET_RATE_LIMIT_MAX_REQUESTS = 60;

const POST_RATE_LIMIT_WINDOW_SECONDS = 60;
const POST_RATE_LIMIT_MAX_REQUESTS = 30;

const MAX_BODY_BYTES = 16 * 1024;


async function checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; resetAt: number }> {
  const resetAt = Date.now() + windowSeconds * 1000;
  try {
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, windowSeconds);
    }
    return { allowed: count <= maxRequests, resetAt };
  } catch {
    return { allowed: true, resetAt };
  }
}

function rateLimitedResponse(resetAt: number) {
  const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { ok: false, reason: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": retryAfterSeconds.toString() },
    }
  );
}

function getBearerToken(request: Request) {
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
  if (!token) {
    return unauthorized();
  }

  const rate = await checkRateLimit(`ratelimit:inbox:get:${token}`, GET_RATE_LIMIT_MAX_REQUESTS, GET_RATE_LIMIT_WINDOW_SECONDS);
  if (!rate.allowed) {
    return rateLimitedResponse(rate.resetAt);
  }

  if (!(await verifyKey(normalized, token))) {
    return unauthorized();
  }

  const tasks = await listTasks(normalized);
  return NextResponse.json({ ok: true, tasks });
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
  if (!token) {
    return unauthorized();
  }

  const rate = await checkRateLimit(`ratelimit:inbox:post:${token}`, POST_RATE_LIMIT_MAX_REQUESTS, POST_RATE_LIMIT_WINDOW_SECONDS);
  if (!rate.allowed) {
    return rateLimitedResponse(rate.resetAt);
  }

  if (!(await verifyKey(normalized, token))) {
    return unauthorized();
  }

  let payload: unknown = {};
  try {
    const bodyText = await request.text();
    if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, reason: "payload_too_large" },
        { status: 413 }
      );
    }
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    // Malformed JSON — return 400 instead of silently accepting empty payload
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 }
    );
  }

  const task = await addTask(normalized, payload);
  return NextResponse.json({ ok: true, task });
}
