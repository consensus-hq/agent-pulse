"use client";

import { useAccount, useReadContract } from "wagmi";
import { isAddress, zeroAddress } from "viem";
import { useEffect, useState, useCallback } from "react";
import { publicEnv } from "../lib/env.public";
import { pulseRegistryAbi } from "../lib/abi";

const REFRESH_INTERVAL_MS = 15000;

type AgentStatus = {
  /** True if alive, false if dead, null if status unknown (both RPC and API failed) */
  isAlive: boolean | null;
  lastPulseAt: number | null;
  streak: number | null;
  hazardScore: number | null;
  loading: boolean;
  /** True if we have valid data from either chain or API */
  hasData: boolean;
  /** Data source: "chain" | "api" | null */
  source: "chain" | "api" | null;
};

export function useAgentStatus(agentAddress?: `0x${string}`): AgentStatus {
  const { address: connectedAddress } = useAccount();
  const targetAddress = agentAddress ?? connectedAddress;
  const registryAddress = isAddress(publicEnv.pulseRegistryAddress)
    ? (publicEnv.pulseRegistryAddress as `0x${string}`)
    : undefined;

  const safeRegistry = registryAddress ?? zeroAddress;
  const safeTarget = isAddress(targetAddress ?? "")
    ? (targetAddress as `0x${string}`)
    : zeroAddress;

  const queryEnabled = Boolean(registryAddress && isAddress(targetAddress ?? ""));

  // Primary: on-chain RPC call
  const { data, isLoading, isError } = useReadContract({
    address: safeRegistry,
    abi: pulseRegistryAbi,
    functionName: "getAgentStatus",
    args: [safeTarget],
    query: {
      enabled: queryEnabled,
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  // Fallback: HTTP API when RPC fails
  const [apiFallback, setApiFallback] = useState<{
    isAlive: boolean;
    lastPulse: number;
    streak: number;
    hazardScore: number;
  } | null>(null);
  const [apiLoading, setApiLoading] = useState(false);

  const fetchApiFallback = useCallback(async () => {
    if (!targetAddress || !isAddress(targetAddress)) return;
    setApiLoading(true);
    try {
      const res = await fetch(`/api/status/${targetAddress}`, { cache: "no-store" });
      if (!res.ok) {
        setApiFallback(null);
        return;
      }
      const json = await res.json();
      setApiFallback({
        isAlive: Boolean(json.isAlive),
        lastPulse: json.lastPulse ?? 0,
        streak: json.streak ?? 0,
        hazardScore: json.hazardScore ?? 0,
      });
    } catch {
      setApiFallback(null);
    } finally {
      setApiLoading(false);
    }
  }, [targetAddress]);

  // Trigger API fallback when RPC fails or returns no data
  useEffect(() => {
    if (!queryEnabled) return;
    // Only fall back if RPC errored or returned undefined after loading
    if (isError || (!isLoading && data === undefined)) {
      void fetchApiFallback();
    }
  }, [isError, isLoading, data, queryEnabled, fetchApiFallback]);

  // Also set up periodic API refresh as fallback
  useEffect(() => {
    if (!queryEnabled || !isError) return;
    const id = window.setInterval(() => {
      void fetchApiFallback();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [queryEnabled, isError, fetchApiFallback]);

  // Determine data source
  const chainHasData = data !== undefined && !isError;
  const [alive, lastPulseAt, streak, hazardScore] = data ?? [];

  if (chainHasData) {
    return {
      isAlive: Boolean(alive),
      lastPulseAt: lastPulseAt ? Number(lastPulseAt) : null,
      streak: streak ? Number(streak) : null,
      hazardScore: hazardScore ? Number(hazardScore) : null,
      loading: isLoading,
      hasData: true,
      source: "chain",
    };
  }

  if (apiFallback) {
    return {
      isAlive: apiFallback.isAlive,
      lastPulseAt: apiFallback.lastPulse ?? null,
      streak: apiFallback.streak ?? null,
      hazardScore: apiFallback.hazardScore ?? null,
      loading: apiLoading,
      hasData: true,
      source: "api",
    };
  }

  return {
    isAlive: null,
    lastPulseAt: null,
    streak: null,
    hazardScore: null,
    loading: isLoading || apiLoading,
    hasData: false,
    source: null,
  };
}
