import { kv } from "@vercel/kv";

/**
 * Nonce Registry for x402 Replay Protection
 * Tracks recently seen nonces per payer address using Vercel KV.
 * Nonces must not be reused within the TTL window.
 */
export class NonceRegistry {
  private static readonly KEY_PREFIX = "nonce:";
  private static readonly TTL_SECONDS = 300; // 5 minutes (matching max token age + buffer)

  /**
   * Get the key for a payer address
   */
  private static getKey(payerAddress: string, nonce: string): string {
    return `${this.KEY_PREFIX}${payerAddress.toLowerCase()}:${nonce}`;
  }

  /**
   * Validate and update the nonce for a payer.
   * Atomic operation using KV.set with NX/EX or get/set logic.
   * Since Vercel KV (Upstash) supports atomic operations, we use those.
   * 
   * Returns true if the nonce is fresh (first use), false otherwise.
   */
  static async validateAndSet(payerAddress: string, nonce: string): Promise<boolean> {
    const key = this.getKey(payerAddress, nonce);

    // Atomic SET with NX + EX: sets key only if not exists, with TTL in one call.
    // Returns "OK" if set, null if key already existed (replay).
    const result = await kv.set(key, "1", { nx: true, ex: this.TTL_SECONDS });
    return result === "OK";
  }
}
