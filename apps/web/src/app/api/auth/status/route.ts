export const runtime = "nodejs";

import { NextResponse } from "next/server";

const CHAIN_ID = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || "";

// GET /api/auth/status → { authenticated: boolean, wallet?: string, chain?: string }
export async function GET(): Promise<NextResponse> {
  // NOTE: The web app uses WalletConnect/RainbowKit for auth-like wallet linking.
  // This endpoint exists primarily for agent tooling/health checks.
  return NextResponse.json({
    authenticated: false,
    chain: CHAIN_ID || undefined,
  });
}
