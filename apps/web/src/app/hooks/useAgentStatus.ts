"use client";

import { useAccount, useReadContract } from "wagmi";
import { isAddress, zeroAddress } from "viem";
import { publicEnv } from "../lib/env.public";
import { pulseRegistryAbi } from "../lib/abi";

const REFRESH_INTERVAL_MS = 15000;

type AgentStatus = {
  /** True if alive, false if dead, null if status unknown (RPC failed) */
  isAlive: boolean | null;
  lastPulseAt: number | null;
  streak: number | null;
  hazardScore: number | null;
  loading: boolean;
  /** True if we have valid data from chain */
  hasData: boolean;
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

  const { data, isLoading, isError } = useReadContract({
    address: safeRegistry,
    abi: pulseRegistryAbi,
    functionName: "getAgentStatus",
    args: [safeTarget],
    query: {
      enabled: Boolean(registryAddress && isAddress(targetAddress ?? "")),
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  // data is undefined if RPC failed or query not enabled
  // Distinguish "unknown" (null) from "dead" (false)
  const hasData = data !== undefined && !isError;
  const [alive, lastPulseAt, streak, hazardScore] = data ?? [];

  return {
    // Return null for isAlive if we don't have data — caller can show "unknown" state
    isAlive: hasData ? Boolean(alive) : null,
    lastPulseAt: lastPulseAt ? Number(lastPulseAt) : null,
    streak: streak ? Number(streak) : null,
    hazardScore: hazardScore ? Number(hazardScore) : null,
    loading: isLoading,
    hasData,
  };
}
