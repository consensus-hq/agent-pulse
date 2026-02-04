import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { addTask, listTasks, verifyKey } from "../../../lib/inboxStore";

export const runtime = "nodejs";

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
  if (!token || !verifyKey(normalized, token)) {
    return unauthorized();
  }

  return NextResponse.json({ ok: true, tasks: listTasks(normalized) });
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

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const task = addTask(normalized, payload);
  return NextResponse.json({ ok: true, task });
}
