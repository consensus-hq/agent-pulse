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
import { base } from "wagmi/chains";
import { publicEnv } from "./lib/env.public";

const baseRpcUrl = publicEnv.baseRpcUrl || undefined;
const transports = {
  [base.id]: http(baseRpcUrl),
};

// Warn in development if WalletConnect Project ID is missing
if (typeof window !== "undefined" && !publicEnv.walletConnectProjectId) {
  console.warn(
    "[Agent Pulse] WalletConnect Project ID not configured. " +
    "Wallet connection will be limited to injected wallets only. " +
    "Get a Project ID at https://cloud.walletconnect.com/"
  );
}

const wagmiConfig = publicEnv.walletConnectProjectId
  ? getDefaultConfig({
      appName: "Agent Pulse",
      projectId: publicEnv.walletConnectProjectId,
      chains: [base],
      transports,
      ssr: true,
    })
  : createConfig({
      chains: [base],
      transports,
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
