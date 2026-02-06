export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { getAbiResponse } from "../route";

type Params = { contract: string };

const normalize = (value: string) => value.trim().toLowerCase().replace(/[_\s]+/g, "-");

export async function GET(
  _request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const { contract } = await context.params;
  const key = normalize(contract);
  const all = getAbiResponse();

  if (key === "pulse-registry" || key === "registry") {
    return NextResponse.json({
      chainId: all.chainId,
      contract: "PulseRegistry",
      abi: all.contracts.PulseRegistry.abi,
    });
  }

  if (key === "pulse-token" || key === "token" || key === "erc20") {
    return NextResponse.json({
      chainId: all.chainId,
      contract: "PulseToken",
      abi: all.contracts.PulseToken.abi,
    });
  }

  return NextResponse.json({ error: `Unknown contract: ${contract}` }, { status: 404 });
}
