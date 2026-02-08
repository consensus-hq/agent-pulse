"use client";

import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { type Config, WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { base, baseSepolia } from "wagmi/chains";
import { ThirdwebProvider } from "thirdweb/react";
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
function createInjectedOnlyConfig(): Config {
  if (IS_MAINNET) {
    return createConfig({
      chains: [base],
      transports: { [base.id]: http(baseRpcUrl) },
      connectors: [injected()],
      ssr: true,
    });
  }

  return createConfig({
    chains: [baseSepolia],
    transports: { [baseSepolia.id]: http(baseRpcUrl) },
    connectors: [injected()],
    ssr: true,
  });
}

function createDefaultWalletConfig(): Config {
  const projectId = publicEnv.walletConnectProjectId;
  if (!projectId) return createInjectedOnlyConfig();

  if (IS_MAINNET) {
    return getDefaultConfig({
      appName: "Agent Pulse",
      projectId,
      chains: [base],
      transports: { [base.id]: http(baseRpcUrl) },
      ssr: true,
    });
  }

  return getDefaultConfig({
    appName: "Agent Pulse",
    projectId,
    chains: [baseSepolia],
    transports: { [baseSepolia.id]: http(baseRpcUrl) },
    ssr: true,
  });
}

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClientRef = useRef<QueryClient | null>(null);
  if (!queryClientRef.current) queryClientRef.current = new QueryClient();

  // During SSR/SSG we must avoid instantiating WalletConnect (it can touch indexedDB).
  // Start with injected-only config for a stable server render, then upgrade on the client.
  const [wagmiConfig, setWagmiConfig] = useState<Config>(() => createInjectedOnlyConfig());
  const [wagmiKey, setWagmiKey] = useState(0);

  useEffect(() => {
    if (!publicEnv.walletConnectProjectId) return;
    setWagmiConfig(createDefaultWalletConfig());
    setWagmiKey(1);
  }, []);

  return (
    <ThirdwebProvider>
      <WagmiProvider key={wagmiKey} config={wagmiConfig}>
        <QueryClientProvider client={queryClientRef.current}>
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: "#4ade80",
              accentColorForeground: "#0a0f0a",
              borderRadius: "small",
              fontStack: "system",
              overlayBlur: "small",
            })}
          >
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThirdwebProvider>
  );
}
