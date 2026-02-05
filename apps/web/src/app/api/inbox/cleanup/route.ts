import { NextRequest, NextResponse } from "next/server";
import { cleanupInboxStore } from "../../../lib/inboxStore";

export const runtime = "nodejs";

const adminToken = process.env.INBOX_ADMIN_TOKEN || "";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  return token || null;
}

function unauthorized() {
  return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  if (!adminToken) {
    return NextResponse.json(
      { ok: false, reason: "admin_disabled" },
      { status: 403 }
    );
  }

  const token = getBearerToken(request);
  if (!token || token !== adminToken) {
    return unauthorized();
  }

  const result = await cleanupInboxStore();
  return NextResponse.json({ ok: true, ...result });
}
