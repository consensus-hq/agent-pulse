"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

export function useWallet() {
  const { address, isConnected, isConnecting, isDisconnected } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  return {
    address,
    isConnected,
    isConnecting,
    isDisconnected,
    connect,
    connectors,
    connectError,
    disconnect,
  };
}
