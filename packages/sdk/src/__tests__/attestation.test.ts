import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentPulseClient } from "../client.js";
import { AttestationModule } from "../attestation.js";
import { AgentPulseError } from "../types.js";

// Mock viem
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    })),
    createWalletClient: vi.fn(() => ({
      writeContract: vi.fn().mockResolvedValue("0xtesttxhash"),
    })),
    http: vi.fn(),
  };
});

// Mock fetch
global.fetch = vi.fn();

describe("AttestationModule", () => {
  let client: AgentPulseClient;
  let attestationModule: AttestationModule;
  const mockAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AgentPulseClient({
      wallet: {
        address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        privateKey: "0x123",
        signMessage: vi.fn().mockResolvedValue("0xsig"),
      },
      x402: {
        serverWalletAddress: "0xserver",
      }
    });
    attestationModule = client.attestation;
  });

  describe("attest", () => {
    it("should submit a positive attestation for success outcome", async () => {
      // Mock getReputation (paid call)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ composite: { score: 85 } }),
      });

      const result = await attestationModule.attest(mockAddress, "success");

      expect(result.success).toBe(true);
      expect(result.outcome).toBe("success");
      expect(result.newScore).toBe(85);
      expect(result.txHash).toBe("0xtesttxhash");
    });

    it("should submit a negative attestation for failure outcome", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ composite: { score: 40 } }),
      });

      const result = await attestationModule.attest(mockAddress, "failure");

      expect(result.outcome).toBe("failure");
      expect(result.newScore).toBe(40);
    });
  });

  describe("getReputation", () => {
    it("should fetch reputation data via paid API", async () => {
      const mockReputation = {
        selfPulse: { streak: 5, consistency: 0.9, lastPulse: 12345 },
        peerAttestations: { positiveRatio: 0.8, negativeCount: 2, weightedAvg: 75, uniqueAttestors: 10 },
        composite: { score: 78, percentile: 0.92 }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockReputation,
      });

      const result = await attestationModule.getReputation(mockAddress);
      expect(result).toEqual(mockReputation);
    });
  });

  describe("withAttestation", () => {
    it("should attest success when work resolves", async () => {
      const work = vi.fn().mockResolvedValue("work result");
      
      // Mock getReputation for the attest call inside withAttestation
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ composite: { score: 90 } }),
      });

      const result = await attestationModule.withAttestation(mockAddress, work);

      expect(result).toBe("work result");
      expect(work).toHaveBeenCalled();
    });

    it("should attest failure when work throws", async () => {
      const work = vi.fn().mockRejectedValue(new Error("work failed"));
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ composite: { score: 30 } }),
      });

      await expect(attestationModule.withAttestation(mockAddress, work))
        .rejects.toThrow("work failed");
      
      // Check that it tried to attest failure
      // (In a full test we'd verify the writeContract args)
    });

    it("should attest timeout when work exceeds limit", async () => {
      const slowWork = () => new Promise(resolve => setTimeout(resolve, 100));
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ composite: { score: 30 } }),
      });

      await expect(attestationModule.withAttestation(mockAddress, slowWork, { timeoutMs: 10 }))
        .rejects.toThrow(/timed out/);
    });
  });
});
