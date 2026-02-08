"use client";

import { useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  isAddress,
  parseEther,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { publicEnv } from "../lib/env.public";

// ═══════════════════════════════════════════════════════════════════
//  DESK WATCH — Frontend Contract Hooks (wagmi v2 + viem)
//  Reads via DeskWatchLens#getFullState() and writes to DeskWatchGame.
//
//  IMPORTANT:
//  - Do not hardcode addresses. Configure via env:
//    NEXT_PUBLIC_DESK_WATCH_GAME_ADDRESS
//    NEXT_PUBLIC_DESK_WATCH_LENS_ADDRESS
// ═══════════════════════════════════════════════════════════════════

function safeParseEther(value: string): bigint | null {
  try {
    return parseEther(value);
  } catch {
    return null;
  }
}

function getConfiguredAddress(value: string): Address | undefined {
  return isAddress(value) ? (value as Address) : undefined;
}

export const deskWatchGameAddress = getConfiguredAddress(publicEnv.deskWatchGameAddress);
export const deskWatchLensAddress = getConfiguredAddress(publicEnv.deskWatchLensAddress);

// ── TIER ENUM (matches Solidity) ──
export const Tier = {
  Scout: 0,
  Sentinel: 1,
  Sniper: 2,
} as const;

export const TIER_CONFIG = {
  [Tier.Scout]: { id: "scout", label: "Scout", icon: "👀", multiplier: 1, minCostEth: "0.0001" },
  [Tier.Sentinel]: { id: "sentinel", label: "Sentinel", icon: "🔭", multiplier: 3, minCostEth: "0.0005" },
  [Tier.Sniper]: { id: "sniper", label: "Sniper", icon: "🎯", multiplier: 7, minCostEth: "0.001" },
} as const;

// ── ABIs (minimal — only the functions we call) ──
export const GAME_ABI = [
  // Read
  {
    name: "currentRound",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    name: "hasWatched",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "deskId", type: "bytes32" },
      { name: "watcher", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "hasUnclaimedReward",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "deskId", type: "bytes32" },
      { name: "watcher", type: "address" },
    ],
    outputs: [
      { name: "has", type: "bool" },
      { name: "reward", type: "uint256" },
    ],
  },
  {
    name: "estimateReward",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "deskId", type: "bytes32" },
      { name: "tier", type: "uint8" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "potentialReward", type: "uint256" }],
  },
  {
    name: "checkDeskLiveness",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "deskId", type: "bytes32" }],
    outputs: [
      { name: "alive", type: "bool" },
      { name: "timeSincePulse", type: "uint256" },
      { name: "gameTTL", type: "uint256" },
    ],
  },
  // Write
  {
    name: "watch",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_deskId", type: "bytes32" },
      { name: "_tier", type: "uint8" },
    ],
    outputs: [],
  },
  {
    name: "reportDeath",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_deskId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "claimReward",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_roundId", type: "uint256" },
      { name: "_deskId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "startRound",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "settleRound",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export const LENS_ABI = [
  {
    name: "getFullState",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_game", type: "address" }],
    outputs: [
      {
        name: "state",
        type: "tuple",
        components: [
          {
            name: "round",
            type: "tuple",
            components: [
              { name: "id", type: "uint256" },
              { name: "startTime", type: "uint256" },
              { name: "endTime", type: "uint256" },
              { name: "timeRemaining", type: "uint256" },
              { name: "status", type: "uint8" },
            ],
          },
          {
            name: "desks",
            type: "tuple[]",
            components: [
              { name: "deskId", type: "bytes32" },
              { name: "name", type: "string" },
              { name: "pulseAgent", type: "address" },
              { name: "operator", type: "address" },
              { name: "status", type: "uint8" },
              { name: "gameTTL", type: "uint256" },
              { name: "totalDeaths", type: "uint256" },
              { name: "totalWatched", type: "uint256" },
              { name: "lastPulseTime", type: "uint256" },
              { name: "protocolTTL", type: "uint256" },
              { name: "isAliveOnChain", type: "bool" },
              { name: "isAliveForGame", type: "bool" },
              { name: "timeSincePulse", type: "uint256" },
              { name: "pool", type: "uint256" },
              { name: "effectivePool", type: "uint256" },
              { name: "watcherCount", type: "uint256" },
              { name: "rollover", type: "uint256" },
              { name: "isDeadThisRound", type: "bool" },
            ],
          },
          {
            name: "stats",
            type: "tuple",
            components: [
              { name: "totalVolume", type: "uint256" },
              { name: "totalDeathsAllTime", type: "uint256" },
              { name: "totalPayoutsAllTime", type: "uint256" },
              { name: "contractBalance", type: "uint256" },
              { name: "protocolFeeBps", type: "uint256" },
              { name: "operatorFeeBps", type: "uint256" },
              { name: "roundDuration", type: "uint256" },
            ],
          },
        ],
      },
    ],
  },
] as const;

/**
 * Fetch the complete game state via the Lens contract in a single RPC call.
 * Poll every `intervalMs` (default 5s) for live updates.
 */
export function useGameState(intervalMs = 5000) {
  const lens = deskWatchLensAddress ?? zeroAddress;
  const game = deskWatchGameAddress ?? zeroAddress;
  const enabled = Boolean(deskWatchLensAddress && deskWatchGameAddress);

  const { data, refetch, isLoading, error } = useReadContract({
    address: lens,
    abi: LENS_ABI,
    functionName: "getFullState",
    args: [game],
    query: {
      enabled,
      refetchInterval: intervalMs,
    },
  });

  return {
    state: data,
    refetch,
    isLoading,
    error,
    isConfigured: enabled,
  };
}

/** Check if the connected wallet has already watched a specific desk this round. */
export function useHasWatched(roundId: bigint | undefined, deskId: Hex | undefined) {
  const { address } = useAccount();
  const game = deskWatchGameAddress ?? zeroAddress;

  return useReadContract({
    address: game,
    abi: GAME_ABI,
    functionName: "hasWatched",
    args: roundId && deskId && address ? [roundId, deskId, address] : undefined,
    query: {
      enabled: Boolean(deskWatchGameAddress && roundId && deskId && address),
    },
  });
}

/** Estimate potential reward for a hypothetical watch. */
export function useEstimateReward(deskId: Hex | undefined, tier: number, amountEth: string) {
  const game = deskWatchGameAddress ?? zeroAddress;
  const amount = safeParseEther(amountEth);

  return useReadContract({
    address: game,
    abi: GAME_ABI,
    functionName: "estimateReward",
    args: deskId && amount !== null ? [deskId, tier, amount] : undefined,
    query: {
      enabled: Boolean(deskWatchGameAddress && deskId && amount !== null && amount > 0n),
    },
  });
}

/** Check desk liveness directly against PulseRegistryV2 (via DeskWatchGame). */
export function useDeskLiveness(deskId: Hex | undefined) {
  const game = deskWatchGameAddress ?? zeroAddress;
  return useReadContract({
    address: game,
    abi: GAME_ABI,
    functionName: "checkDeskLiveness",
    args: deskId ? [deskId] : undefined,
    query: {
      enabled: Boolean(deskWatchGameAddress && deskId),
      refetchInterval: 10_000,
    },
  });
}

/** Check for unclaimed rewards from a past round. */
export function useUnclaimedReward(roundId: bigint | undefined, deskId: Hex | undefined) {
  const { address } = useAccount();
  const game = deskWatchGameAddress ?? zeroAddress;

  return useReadContract({
    address: game,
    abi: GAME_ABI,
    functionName: "hasUnclaimedReward",
    args: roundId && deskId && address ? [roundId, deskId, address] : undefined,
    query: {
      enabled: Boolean(deskWatchGameAddress && roundId && deskId && address),
    },
  });
}

/** Place a watch on a desk. Sends ETH as the watch deposit. */
export function useWatch() {
  const game = deskWatchGameAddress;
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const placeWatch = useCallback(
    (deskId: Hex, tier: number, amountEth: string) => {
      if (!game) return;
      const value = safeParseEther(amountEth);
      if (value === null) return;

      writeContract({
        address: game,
        abi: GAME_ABI,
        functionName: "watch",
        args: [deskId, tier],
        value,
      });
    },
    [game, writeContract]
  );

  return {
    placeWatch,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    isConfigured: Boolean(game),
  };
}

/** Report a desk as dead. Verifies against PulseRegistryV2 on-chain. */
export function useReportDeath() {
  const game = deskWatchGameAddress;
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const reportDeath = useCallback(
    (deskId: Hex) => {
      if (!game) return;
      writeContract({
        address: game,
        abi: GAME_ABI,
        functionName: "reportDeath",
        args: [deskId],
      });
    },
    [game, writeContract]
  );

  return { reportDeath, hash, isPending, isConfirming, isSuccess, error, isConfigured: Boolean(game) };
}

/** Claim reward for a desk that died. */
export function useClaimReward() {
  const game = deskWatchGameAddress;
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimReward = useCallback(
    (roundId: bigint, deskId: Hex) => {
      if (!game) return;
      writeContract({
        address: game,
        abi: GAME_ABI,
        functionName: "claimReward",
        args: [roundId, deskId],
      });
    },
    [game, writeContract]
  );

  return { claimReward, hash, isPending, isConfirming, isSuccess, error, isConfigured: Boolean(game) };
}

/** Start a new round (anyone can call). */
export function useStartRound() {
  const game = deskWatchGameAddress;
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const startRound = useCallback(() => {
    if (!game) return;
    writeContract({
      address: game,
      abi: GAME_ABI,
      functionName: "startRound",
    });
  }, [game, writeContract]);

  return { startRound, hash, isPending, isConfirming, isSuccess, error, isConfigured: Boolean(game) };
}

/** Settle an expired round (anyone can call). */
export function useSettleRound() {
  const game = deskWatchGameAddress;
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const settleRound = useCallback(() => {
    if (!game) return;
    writeContract({
      address: game,
      abi: GAME_ABI,
      functionName: "settleRound",
    });
  }, [game, writeContract]);

  return { settleRound, hash, isPending, isConfirming, isSuccess, error, isConfigured: Boolean(game) };
}

