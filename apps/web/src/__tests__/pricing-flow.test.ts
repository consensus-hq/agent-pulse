import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { settleX402Payment, withX402 } from "@/lib/x402";

// Mock thirdweb
vi.mock("thirdweb", () => ({
  createThirdwebClient: vi.fn(),
}));

vi.mock("thirdweb/x402", () => ({
  facilitator: vi.fn(),
  settlePayment: vi.fn(),
}));

// Mock viem
const mockWriteContract = vi.fn().mockResolvedValue("0xburnhash");
vi.mock("viem", () => ({
  createWalletClient: vi.fn(() => ({
    extend: vi.fn(() => ({
      writeContract: mockWriteContract,
    })),
  })),
  http: vi.fn(),
  publicActions: vi.fn(),
  parseAbi: vi.fn(),
  getContract: vi.fn(),
}));

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(),
}));

// Mock request binding
vi.mock("@/lib/x402-request-binding", () => ({
  verifyRequestBinding: vi.fn().mockResolvedValue({ valid: true }),
}));

describe("Pricing & Burn Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.THIRDWEB_SECRET_KEY = "sk_test";
    process.env.SERVER_WALLET_ADDRESS = "0xServer";
    process.env.SERVER_WALLET_PRIVATE_KEY = "0xPrivate";
    process.env.NEXT_PUBLIC_BURN_WITH_FEE_ADDRESS = "0xBurn";
  });

  it("should settle payment and trigger burn", async () => {
    const { settlePayment } = await import("thirdweb/x402");
    // Mock successful settlement
    (settlePayment as any).mockResolvedValue({
      status: 200,
      paymentReceipt: { payer: "0xUser" },
    });

    const req = new NextRequest("http://localhost/api/test", {
      headers: { "x-402-payment": "valid_token" },
    });

    const result = await settleX402Payment(req, "$0.01");

    expect(result.status).toBe(200);
    expect(settlePayment).toHaveBeenCalled();
    
    // Check if burn was triggered
    // Since logic awaits the burn, we expect mockWriteContract to be called
    expect(mockWriteContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "burnWithFee",
      args: [1000000000000000000n]
    }));
  });

  it("withX402 middleware should return 402 if no header", async () => {
    const req = new NextRequest("http://localhost/api/test");
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ success: true }));
    
    const res = await withX402(req, { price: 1000000n }, handler);
    
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("Payment Required");
  });
});
