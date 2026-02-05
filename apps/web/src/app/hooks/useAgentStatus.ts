"use client";

import { useAccount, useReadContract } from "wagmi";
import { isAddress, zeroAddress } from "viem";
import { publicEnv } from "../lib/env.public";
import { pulseRegistryAbi } from "../lib/abi";

const REFRESH_INTERVAL_MS = 15000;

type AgentStatus = {
  isAlive: boolean;
  lastPulseAt: number | null;
  streak: number | null;
  hazardScore: number | null;
  loading: boolean;
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

  const { data, isLoading } = useReadContract({
    address: safeRegistry,
    abi: pulseRegistryAbi,
    functionName: "getAgentStatus",
    args: [safeTarget],
    query: {
      enabled: Boolean(registryAddress && isAddress(targetAddress ?? "")),
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  const [alive, lastPulseAt, streak, hazardScore] = data ?? [];

  return {
    isAlive: Boolean(alive),
    lastPulseAt: lastPulseAt ? Number(lastPulseAt) : null,
    streak: streak ? Number(streak) : null,
    hazardScore: hazardScore ? Number(hazardScore) : null,
    loading: isLoading,
  };
}
