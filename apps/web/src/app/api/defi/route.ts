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
  if (!HEYELSA_API_URL) {
    return NextResponse.json({ error: "Missing HeyElsa API configuration." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "";

  if (!action) {
    return NextResponse.json({ error: "Missing action parameter.", validActions: ["price", "portfolio"] }, { status: 400 });
  }

  const endpoint = action === "price" ? "/price" : action === "portfolio" ? "/portfolio" : "";
  if (!endpoint) {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

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
  });

  const bodyText = await response.text();

  if (!response.ok) {
    return NextResponse.json(
      { error: "HeyElsa request failed.", details: bodyText },
      { status: response.status },
    );
  }

  return new NextResponse(bodyText, {
    status: 200,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
  });
}
