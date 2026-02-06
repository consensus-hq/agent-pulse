"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { base, baseSepolia } from "wagmi/chains";
import { publicEnv } from "./lib/env.public";

const IS_MAINNET = publicEnv.chainId === "8453";
const baseRpcUrl = publicEnv.baseRpcUrl || undefined;

// Warn in development if WalletConnect Project ID is missing
if (typeof window !== "undefined" && !publicEnv.walletConnectProjectId) {
  console.warn(
    "[Agent Pulse] WalletConnect Project ID not configured. " +
    "Wallet connection will be limited to injected wallets only. " +
    "Get a Project ID at https://cloud.walletconnect.com/"
  );
}

// Build wagmi config for the correct chain based on environment
const wagmiConfig = IS_MAINNET
  ? publicEnv.walletConnectProjectId
    ? getDefaultConfig({
        appName: "Agent Pulse",
        projectId: publicEnv.walletConnectProjectId,
        chains: [base],
        transports: { [base.id]: http(baseRpcUrl) },
        ssr: true,
      })
    : createConfig({
        chains: [base],
        transports: { [base.id]: http(baseRpcUrl) },
        connectors: [injected()],
        ssr: true,
      })
  : publicEnv.walletConnectProjectId
    ? getDefaultConfig({
        appName: "Agent Pulse",
        projectId: publicEnv.walletConnectProjectId,
        chains: [baseSepolia],
        transports: { [baseSepolia.id]: http(baseRpcUrl) },
        ssr: true,
      })
    : createConfig({
        chains: [baseSepolia],
        transports: { [baseSepolia.id]: http(baseRpcUrl) },
        connectors: [injected()],
        ssr: true,
      });

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
