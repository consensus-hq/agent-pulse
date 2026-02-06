"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { publicEnv } from "../lib/env.public";

/**
 * EIP-747 wallet_watchAsset — prompts MetaMask (or any injected wallet)
 * to add the PULSE token to the user's token list.
 */
export function useAddToken() {
  const { connector } = useAccount();
  const [added, setAdded] = useState(false);

  const addToken = useCallback(async () => {
    if (!publicEnv.pulseTokenAddress) return;

    try {
      // Get the provider from the active connector
      const provider = await connector?.getProvider();
      if (!provider || typeof (provider as any).request !== "function") return;

      const wasAdded = await (provider as any).request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: publicEnv.pulseTokenAddress,
            symbol: "PULSE",
            decimals: 18,
            // Token image — use the Clanker-generated logo if available
            image: `https://agent-pulse-nine.vercel.app/icon.svg`,
          },
        },
      });

      if (wasAdded) setAdded(true);
    } catch (err) {
      console.warn("wallet_watchAsset failed:", err);
    }
  }, [connector]);

  return { addToken, added };
}
