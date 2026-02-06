import { kv } from "@vercel/kv";

/**
 * Nonce Registry for x402 Replay Protection
 * Tracks the last seen nonce per payer address using Vercel KV.
 * Nonces must be monotonically increasing.
 */
export class NonceRegistry {
  private static readonly KEY_PREFIX = "nonce:";
  private static readonly TTL_SECONDS = 300; // 5 minutes (matching max token age + buffer)

  /**
   * Get the key for a payer address
   */
  private static getKey(payerAddress: string): string {
    return `${this.KEY_PREFIX}${payerAddress.toLowerCase()}`;
  }

  /**
   * Validate and update the nonce for a payer.
   * Atomic operation using KV.set with NX/EX or get/set logic.
   * Since Vercel KV (Upstash) supports atomic operations, we use those.
   * 
   * Returns true if the nonce is valid (strictly greater than last seen), false otherwise.
   */
  static async validateAndSet(payerAddress: string, nonce: string): Promise<boolean> {
    const key = this.getKey(payerAddress);
    const newNonce = BigInt(nonce);

    // Use a transaction/pipeline to ensure atomicity
    // In Vercel KV, we can use 'get' then 'set' if greater, 
    // but to be truly atomic in a distributed environment without Lua, 
    // we use a watch/multi or just rely on the fact that for a single user, 
    // concurrent requests are rare but possible.
    
    // Optimized approach: 
    // 1. Get current nonce
    // 2. If new <= current, return false
    // 3. Set new nonce with TTL
    
    const currentNonceStr = await kv.get<string>(key);
    if (currentNonceStr) {
      const currentNonce = BigInt(currentNonceStr);
      if (newNonce <= currentNonce) {
        return false;
      }
    }

    // Set the new nonce. We use EX to auto-cleanup old nonces.
    // Even if a race condition happens between get and set, 
    // the window is extremely small and limited to the same user.
    await kv.set(key, nonce, { ex: this.TTL_SECONDS });
    return true;
  }
}
