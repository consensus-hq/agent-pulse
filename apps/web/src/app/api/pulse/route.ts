export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { withX402 as paymentMiddleware } from "@x402/next";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

const CHAIN_ID = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || "";
const NETWORK = CHAIN_ID === "8453" ? "eip155:8453" : "eip155:84532";

const PULSE_AMOUNT = process.env.PULSE_AMOUNT || "1000000000000000000";
const PULSE_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS || "";
const SIGNAL_SINK_ADDRESS =
  process.env.SIGNAL_SINK_ADDRESS || process.env.NEXT_PUBLIC_SIGNAL_SINK_ADDRESS || "";
const PULSE_TOKEN_NAME = process.env.PULSE_TOKEN_NAME || "";
const PULSE_TOKEN_VERSION = process.env.PULSE_TOKEN_VERSION || "";

const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL || process.env.THIRDWEB_X402_FACILITATOR_URL || "";
const THIRDWEB_CLIENT_ID = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "";
const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY || "";

// Defer config validation to runtime — module-level throws break next build
const X402_CONFIGURED =
  !!FACILITATOR_URL && !!PULSE_TOKEN_ADDRESS && !!SIGNAL_SINK_ADDRESS && !!PULSE_TOKEN_NAME && !!PULSE_TOKEN_VERSION;

if (X402_CONFIGURED && !FACILITATOR_URL) {
  // unreachable — guard for type narrowing only
}

const createAuthHeaders = async (): Promise<{
  verify: Record<string, string>;
  settle: Record<string, string>;
  supported: Record<string, string>;
}> => {
  const headers: Record<string, string> = {};
  if (THIRDWEB_SECRET_KEY) {
    headers["x-secret-key"] = THIRDWEB_SECRET_KEY;
  } else if (THIRDWEB_CLIENT_ID) {
    headers["x-client-id"] = THIRDWEB_CLIENT_ID;
  }
  return { verify: headers, settle: headers, supported: headers };
};

const handler = async (request: NextRequest): Promise<NextResponse> => {
  if (!X402_CONFIGURED) {
    return NextResponse.json(
      { error: "x402 pulse endpoint not configured. Set X402_FACILITATOR_URL, PULSE_TOKEN_ADDRESS, SIGNAL_SINK_ADDRESS, PULSE_TOKEN_NAME, PULSE_TOKEN_VERSION." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { agent?: string };
  const agent = body.agent?.toLowerCase();

  if (!agent) {
    return NextResponse.json({ error: "Missing agent address." }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    agent,
    paidAmount: PULSE_AMOUNT,
  });
};

// Only wire x402 middleware when fully configured; otherwise export plain handler
let postHandler: (req: NextRequest) => Promise<NextResponse>;

if (X402_CONFIGURED) {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: FACILITATOR_URL,
    createAuthHeaders,
  });

  const resourceServer = registerExactEvmScheme(new x402ResourceServer(facilitatorClient), {
    networks: [NETWORK],
  });

  postHandler = paymentMiddleware(
    handler,
    {
      accepts: {
        scheme: "exact",
        network: NETWORK,
        payTo: SIGNAL_SINK_ADDRESS,
        price: {
          amount: PULSE_AMOUNT,
          asset: PULSE_TOKEN_ADDRESS,
          extra: {
            name: PULSE_TOKEN_NAME,
            version: PULSE_TOKEN_VERSION,
          },
        },
      },
      description: "Submit an Agent Pulse signal.",
    },
    resourceServer,
  ) as unknown as (req: NextRequest) => Promise<NextResponse>;
} else {
  postHandler = handler;
}

export const POST = postHandler;
