// @ts-nocheck
import { NextRequest } from "next/server";
import { 
  verifyRequestBinding, 
  calculateBodyHash, 
  createSignablePayload,
  X402RequestPayload 
} from "../x402-request-binding";
import { NonceRegistry } from "../nonce-registry";
import { kv } from "@vercel/kv";
import { Wallet, verifyMessage } from "ethers";

// Mock KV
jest.mock("@vercel/kv", () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

describe("x402 Request Binding", () => {
  const privateKey = "0x0123456789012345678901234567890123456789012345678901234567890123";
  const wallet = new Wallet(privateKey);
  const sender = wallet.address;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createValidToken(overrides: Partial<X402RequestPayload> = {}) {
    const payload: Omit<X402RequestPayload, "x402-signature"> = {
      "x402-version": "1.0",
      "x402-network": "base-sepolia",
      "x402-contract": "0x123",
      "x402-amount": "1000",
      "x402-sender": sender,
      "x402-method": "GET",
      "x402-path": "/api/test",
      "x402-body-hash": await calculateBodyHash(""),
      "x402-nonce": "100",
      "x402-expires-at": Math.floor(Date.now() / 1000) + 30,
      ...overrides,
    };

    const signable = createSignablePayload(payload);
    const signature = await wallet.signMessage(signable);
    
    return Buffer.from(JSON.stringify({
      ...payload,
      "x402-signature": signature,
    })).toString("base64");
  }

  it("should verify a valid token", async () => {
    const token = await createValidToken();
    const req = new NextRequest("https://example.com/api/test", { method: "GET" });
    
    (kv.get as jest.Mock).mockResolvedValue("99"); // Previous nonce was 99
    
    const result = await verifyRequestBinding(req, token);
    expect(result.valid).toBe(true);
    expect(result.sender.toLowerCase()).toBe(sender.toLowerCase());
  });

  it("should fail on method mismatch", async () => {
    const token = await createValidToken({ "x402-method": "POST" });
    const req = new NextRequest("https://example.com/api/test", { method: "GET" });
    
    const result = await verifyRequestBinding(req, token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("METHOD_MISMATCH");
  });

  it("should fail on path mismatch", async () => {
    const token = await createValidToken({ "x402-path": "/api/wrong" });
    const req = new NextRequest("https://example.com/api/test", { method: "GET" });
    
    const result = await verifyRequestBinding(req, token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("PATH_MISMATCH");
  });

  it("should fail on expired token", async () => {
    const token = await createValidToken({ 
      "x402-expires-at": Math.floor(Date.now() / 1000) - 10 
    });
    const req = new NextRequest("https://example.com/api/test", { method: "GET" });
    
    const result = await verifyRequestBinding(req, token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("TOKEN_EXPIRED");
  });

  it("should fail on nonce replay", async () => {
    const token = await createValidToken({ "x402-nonce": "100" });
    const req = new NextRequest("https://example.com/api/test", { method: "GET" });
    
    (kv.get as jest.Mock).mockResolvedValue("100"); // Nonce 100 already seen
    
    const result = await verifyRequestBinding(req, token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("NONCE_ALREADY_USED");
  });

  it("should fail on body hash mismatch", async () => {
    const token = await createValidToken({ 
      "x402-method": "POST",
      "x402-body-hash": await calculateBodyHash('{"data":1}') 
    });
    const req = new NextRequest("https://example.com/api/test", { 
      method: "POST",
      body: JSON.stringify({ data: 2 }) // Different body
    });
    
    (kv.get as jest.Mock).mockResolvedValue("99");
    
    const result = await verifyRequestBinding(req, token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("BODY_HASH_MISMATCH");
  });
});
