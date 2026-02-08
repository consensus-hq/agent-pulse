export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { withPaymentGate, type PriceConfig } from "../../paid/x402";
import { addWatch, type WatchTierId } from "../_lib/state";

const TIER_COSTS: Record<WatchTierId, { cost: PriceConfig; multiplier: number }> = {
  scout: { cost: { display: "$0.10", atomic: "100000" }, multiplier: 1 },
  sentinel: { cost: { display: "$0.50", atomic: "500000" }, multiplier: 3 },
  sniper: { cost: { display: "$1.00", atomic: "1000000" }, multiplier: 7 },
} as const;

type SubscribeBody = {
  deskId?: string;
  tier?: WatchTierId;
  /**
   * Optional: used only for bypass-mode requests.
   * When paying via x402, the payer address is derived from the x402 payload.
   */
  wallet?: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as SubscribeBody | null;
  if (!body?.deskId || !body?.tier) {
    return NextResponse.json(
      { error: "Missing required fields: deskId, tier" },
      { status: 400 },
    );
  }

  const tierCfg = TIER_COSTS[body.tier];
  if (!tierCfg) {
    return NextResponse.json(
      { error: `Invalid tier: ${String(body.tier)}` },
      { status: 400 },
    );
  }

  const handler = withPaymentGate(tierCfg.cost, async (_request, payment) => {
    const wallet =
      payment.method === "x402"
        ? payment.payer
        : (body.wallet || payment.payer || "bypass");

    try {
      const { round, watch, pool } = addWatch({
        deskId: body.deskId!,
        wallet,
        tier: body.tier!,
        costAtomic: tierCfg.cost.atomic,
        multiplier: tierCfg.multiplier,
      });

      return NextResponse.json({
        success: true,
        round,
        watch,
        pool,
        payment,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const status = msg.toLowerCase().includes("already") ? 409 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
  });

  return handler(req);
}

