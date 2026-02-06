import { NextRequest, NextResponse } from "next/server";

const HEYELSA_API_URL = process.env.HEYELSA_X402_API_URL || process.env.HEYELSA_API_URL || "";
const THIRDWEB_CLIENT_ID = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "";
const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY || "";

const buildAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (THIRDWEB_SECRET_KEY) {
    headers["x-secret-key"] = THIRDWEB_SECRET_KEY;
  } else if (THIRDWEB_CLIENT_ID) {
    headers["x-client-id"] = THIRDWEB_CLIENT_ID;
  }
  return headers;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "";

  if (!action) {
    return NextResponse.json(
      { error: "Missing action parameter.", validActions: ["price", "portfolio"] },
      { status: 400 },
    );
  }

  const endpoint = action === "price" ? "/price" : action === "portfolio" ? "/portfolio" : "";
  if (!endpoint) {
    return NextResponse.json({ error: "Unsupported action.", validActions: ["price", "portfolio"] }, { status: 400 });
  }

  // If HeyElsa API is not configured, return a structured unavailable response
  if (!HEYELSA_API_URL) {
    return NextResponse.json(
      {
        error: "DeFi data source not configured.",
        available: false,
        action,
        message: "HeyElsa x402 API integration pending. Token data available via /api/status/{address} and /api/protocol-health.",
      },
      { status: 503 },
    );
  }

  try {
    const targetUrl = new URL(endpoint, HEYELSA_API_URL);
    for (const [key, value] of searchParams.entries()) {
      if (key === "action") continue;
      targetUrl.searchParams.append(key, value);
    }

    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...buildAuthHeaders(),
      },
      signal: AbortSignal.timeout(10000),
    });

    const bodyText = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: "DeFi data temporarily unavailable.", details: bodyText, available: false },
        { status: 502 },
      );
    }

    return new NextResponse(bodyText, {
      status: 200,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "DeFi data temporarily unavailable.",
        available: false,
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 503 },
    );
  }
}
