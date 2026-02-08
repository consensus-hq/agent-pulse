import { NextRequest, NextResponse } from "next/server";

const ANVIL_RPC_URL = process.env.NEXT_PUBLIC_FORK_RPC_URL || "http://127.0.0.1:8546";

// Supported Anvil methods for time manipulation
const SUPPORTED_METHODS = [
  "evm_snapshot",
  "evm_revert",
  "evm_increaseTime",
  "evm_mine",
  "evm_setNextBlockTimestamp",
  "eth_blockNumber",
];

interface AnvilRequest {
  method: string;
  params?: unknown[];
}

async function callAnvilRPC(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(ANVIL_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anvil RPC error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Anvil RPC error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body: AnvilRequest = await request.json();
    const { method, params = [] } = body;

    // Validate method
    if (!SUPPORTED_METHODS.includes(method)) {
      return NextResponse.json(
        { error: `Unsupported method: ${method}. Supported methods: ${SUPPORTED_METHODS.join(", ")}` },
        { status: 400 }
      );
    }

    // Forward to Anvil
    const result = await callAnvilRPC(method, params);

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Anvil API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
