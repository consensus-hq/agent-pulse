import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { addTask, listTasks, verifyKey } from "../../../lib/inboxStore";
import { createRateLimiter } from "../../../lib/rateLimit";

export const runtime = "nodejs";

const getRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
});

const postRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
});

const MAX_BODY_BYTES = 16 * 1024;

function rateLimitedResponse(resetMs: number) {
  return NextResponse.json(
    { ok: false, reason: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": Math.ceil(resetMs / 1000).toString() },
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

  const rate = getRateLimiter.check(token);
  if (!rate.allowed) {
    return rateLimitedResponse(rate.resetMs);
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

  const rate = postRateLimiter.check(token);
  if (!rate.allowed) {
    return rateLimitedResponse(rate.resetMs);
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
    payload = {};
  }

  const task = await addTask(normalized, payload);
  return NextResponse.json({ ok: true, task });
}
