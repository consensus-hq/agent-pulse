export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

// ============================================
// ENV CONFIG
// ============================================

const CHAIN_ID = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || "";
const IS_MAINNET = CHAIN_ID === "8453";
const NETWORK = IS_MAINNET ? "eip155:8453" : "eip155:84532";

const PULSE_AMOUNT = process.env.PULSE_AMOUNT || "1000000000000000000";
const PULSE_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_PULSE_TOKEN_ADDRESS || "";
const SIGNAL_SINK_ADDRESS =
  process.env.SIGNAL_SINK_ADDRESS || process.env.NEXT_PUBLIC_SIGNAL_SINK_ADDRESS || "";
const PULSE_TOKEN_NAME = process.env.PULSE_TOKEN_NAME || "";
const PULSE_TOKEN_VERSION = process.env.PULSE_TOKEN_VERSION || "";

// Testnet: HTTP facilitator (x402.org)
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "";
// Mainnet: Thirdweb SDK facilitator
const USE_THIRDWEB_FACILITATOR = process.env.USE_THIRDWEB_FACILITATOR === "true";
const THIRDWEB_CLIENT_ID = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "";
const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY || "";

const CORE_CONFIGURED =
  !!PULSE_TOKEN_ADDRESS && !!SIGNAL_SINK_ADDRESS && !!PULSE_TOKEN_NAME && !!PULSE_TOKEN_VERSION;

// Testnet needs FACILITATOR_URL; mainnet needs Thirdweb credentials
const X402_CONFIGURED = CORE_CONFIGURED && (
  USE_THIRDWEB_FACILITATOR
    ? !!THIRDWEB_SECRET_KEY
    : !!FACILITATOR_URL
);

// ============================================
// BUSINESS LOGIC HANDLER (runs after payment verified)
// ============================================

const handler = async (request: NextRequest): Promise<NextResponse> => {
  if (!X402_CONFIGURED) {
    const missing = [];
    if (!PULSE_TOKEN_ADDRESS) missing.push("PULSE_TOKEN_ADDRESS");
    if (!SIGNAL_SINK_ADDRESS) missing.push("SIGNAL_SINK_ADDRESS");
    if (!PULSE_TOKEN_NAME) missing.push("PULSE_TOKEN_NAME");
    if (!PULSE_TOKEN_VERSION) missing.push("PULSE_TOKEN_VERSION");
    if (!USE_THIRDWEB_FACILITATOR && !FACILITATOR_URL) missing.push("X402_FACILITATOR_URL or USE_THIRDWEB_FACILITATOR");
    if (USE_THIRDWEB_FACILITATOR && !THIRDWEB_SECRET_KEY) missing.push("THIRDWEB_SECRET_KEY");

    return NextResponse.json(
      { error: `x402 pulse endpoint not configured. Missing: ${missing.join(", ")}` },
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

// ============================================
// x402 PAYMENT MIDDLEWARE SETUP
// ============================================

let postHandler: (req: NextRequest) => Promise<NextResponse>;

if (X402_CONFIGURED && USE_THIRDWEB_FACILITATOR) {
  // ---- MAINNET PATH: Thirdweb SDK facilitator ----
  // Uses thirdweb/x402 settlePayment() — no HTTP facilitator URL needed
  const { createThirdwebClient } = await import("thirdweb");
  const { facilitator: createFacilitator, settlePayment } = await import("thirdweb/x402");
  const { base } = await import("thirdweb/chains");

  const thirdwebClient = createThirdwebClient({ secretKey: THIRDWEB_SECRET_KEY });
  const thirdwebFacilitator = createFacilitator({
    client: thirdwebClient,
    serverWalletAddress: SIGNAL_SINK_ADDRESS,
  });

  postHandler = async (req: NextRequest): Promise<NextResponse> => {
    // Extract payment header (standard x402 header names)
    const paymentData =
      req.headers.get("PAYMENT-SIGNATURE") ||
      req.headers.get("X-PAYMENT") ||
      req.headers.get("x-402-payment");

    if (!paymentData) {
      // Return 402 with payment requirements
      return NextResponse.json(
        {
          x402Version: 1,
          error: "Payment required",
          accepts: [
            {
              scheme: "exact",
              network: NETWORK,
              maxAmountRequired: PULSE_AMOUNT,
              asset: PULSE_TOKEN_ADDRESS,
              payTo: SIGNAL_SINK_ADDRESS,
              maxTimeoutSeconds: 300,
              extra: {
                name: PULSE_TOKEN_NAME,
                version: PULSE_TOKEN_VERSION,
              },
            },
          ],
          description: "Submit an Agent Pulse signal.",
        },
        { status: 402 },
      );
    }

    try {
      const result = await settlePayment({
        paymentData,
        payTo: SIGNAL_SINK_ADDRESS,
        network: base,
        price: PULSE_AMOUNT,
        facilitator: thirdwebFacilitator,
        resourceUrl: req.url,
        method: "POST",
      });

      if (result.status === 200) {
        return handler(req);
      }

      return NextResponse.json(
        result.responseBody ?? { error: "Payment verification failed" },
        {
          status: result.status,
          headers: result.responseHeaders
            ? Object.fromEntries(
                Object.entries(result.responseHeaders).filter(
                  (entry): entry is [string, string] => typeof entry[1] === "string"
                )
              )
            : undefined,
        },
      );
    } catch (err) {
      console.error("[x402 Thirdweb] Settlement error:", err);
      return NextResponse.json(
        { error: "Payment settlement failed", message: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  };
} else if (X402_CONFIGURED && FACILITATOR_URL) {
  // ---- TESTNET PATH: HTTP facilitator (x402.org) ----
  const { withX402: paymentMiddleware } = await import("@x402/next");
  const { HTTPFacilitatorClient, x402ResourceServer } = await import("@x402/core/server");
  const { registerExactEvmScheme } = await import("@x402/evm/exact/server");

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
  // ---- UNCONFIGURED: return 503 ----
  postHandler = handler;
}

export const POST = postHandler;
