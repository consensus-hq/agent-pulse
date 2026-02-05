"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { isAddress, zeroAddress } from "viem";
import { publicEnv } from "../lib/env.public";
import { erc20Abi, pulseRegistryAbi } from "../lib/abi";

export type PulseStatus =
  | "idle"
  | "approving"
  | "approved"
  | "pulsing"
  | "confirmed"
  | "error";

const REFRESH_INTERVAL_MS = 15000;

const formatError = (error: unknown) => {
  if (!error) return "Transaction failed.";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "shortMessage" in error) {
    const message = (error as { shortMessage?: string }).shortMessage;
    if (message) return message;
  }
  if (error instanceof Error) return error.message.split("\n")[0];
  return "Transaction failed.";
};

export function usePulse() {
  const { address } = useAccount();
  const registryAddress = isAddress(publicEnv.pulseRegistryAddress)
    ? (publicEnv.pulseRegistryAddress as `0x${string}`)
    : undefined;
  const tokenAddress = isAddress(publicEnv.pulseTokenAddress)
    ? (publicEnv.pulseTokenAddress as `0x${string}`)
    : undefined;

  const safeRegistry = registryAddress ?? zeroAddress;
  const safeToken = tokenAddress ?? zeroAddress;
  const safeOwner = isAddress(address ?? "")
    ? (address as `0x${string}`)
    : zeroAddress;

  const { data: minPulseAmount } = useReadContract({
    address: safeRegistry,
    abi: pulseRegistryAbi,
    functionName: "minPulseAmount",
    query: {
      enabled: Boolean(registryAddress),
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  const {
    data: allowance,
    refetch: refetchAllowance,
    isLoading: allowanceLoading,
  } = useReadContract({
    address: safeToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: [safeOwner, safeRegistry],
    query: {
      enabled: Boolean(registryAddress && tokenAddress && isAddress(address ?? "")),
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  const {
    data: balance,
    refetch: refetchBalance,
    isLoading: balanceLoading,
  } = useReadContract({
    address: safeToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [safeOwner],
    query: {
      enabled: Boolean(tokenAddress && isAddress(address ?? "")),
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  const { data: decimals } = useReadContract({
    address: safeToken,
    abi: erc20Abi,
    functionName: "decimals",
    query: {
      enabled: Boolean(tokenAddress),
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  const { data: symbol } = useReadContract({
    address: safeToken,
    abi: erc20Abi,
    functionName: "symbol",
    query: {
      enabled: Boolean(tokenAddress),
      refetchInterval: REFRESH_INTERVAL_MS,
    },
  });

  const [status, setStatus] = useState<PulseStatus>("idle");
  const [error, setError] = useState<string>("");
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>();
  const [pulseHash, setPulseHash] = useState<`0x${string}` | undefined>();

  const approveReceipt = useWaitForTransactionReceipt({
    hash: approveHash,
    query: { enabled: Boolean(approveHash) },
  });

  const pulseReceipt = useWaitForTransactionReceipt({
    hash: pulseHash,
    query: { enabled: Boolean(pulseHash) },
  });

  const { writeContractAsync } = useWriteContract();

  const minAmount = minPulseAmount ?? 0n;
  const currentAllowance = allowance ?? 0n;

  const hasConfig = Boolean(registryAddress && tokenAddress);
  const isConnected = Boolean(address && isAddress(address));
  const needsApproval = hasConfig && isConnected && minAmount > 0n
    ? currentAllowance < minAmount
    : false;

  const approve = useCallback(
    async (amount?: bigint) => {
      if (!tokenAddress || !registryAddress) {
        setStatus("error");
        setError("Missing contract configuration.");
        return;
      }
      const targetAmount = amount ?? minAmount;
      if (!targetAmount || targetAmount <= 0n) {
        setStatus("error");
        setError("Min pulse amount unavailable.");
        return;
      }
      setStatus("approving");
      setError("");
      try {
        const hash = await writeContractAsync({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [registryAddress, targetAmount],
        });
        setApproveHash(hash);
      } catch (err) {
        setStatus("error");
        setError(formatError(err));
      }
    },
    [minAmount, registryAddress, tokenAddress, writeContractAsync]
  );

  const pulse = useCallback(
    async (amount?: bigint) => {
      if (!registryAddress) {
        setStatus("error");
        setError("Missing registry address.");
        return;
      }
      const targetAmount = amount ?? minAmount;
      if (!targetAmount || targetAmount <= 0n) {
        setStatus("error");
        setError("Min pulse amount unavailable.");
        return;
      }
      setStatus("pulsing");
      setError("");
      try {
        const hash = await writeContractAsync({
          address: registryAddress,
          abi: pulseRegistryAbi,
          functionName: "pulse",
          args: [targetAmount],
        });
        setPulseHash(hash);
      } catch (err) {
        setStatus("error");
        setError(formatError(err));
      }
    },
    [minAmount, registryAddress, writeContractAsync]
  );

  useEffect(() => {
    if (approveReceipt.isSuccess) {
      setStatus("approved");
      setApproveHash(undefined);
      void refetchAllowance();
    }
    if (approveReceipt.isError) {
      setStatus("error");
      setError(formatError(approveReceipt.error));
    }
  }, [approveReceipt.error, approveReceipt.isError, approveReceipt.isSuccess, refetchAllowance]);

  useEffect(() => {
    if (pulseReceipt.isSuccess) {
      setStatus("confirmed");
      setPulseHash(undefined);
      void refetchAllowance();
      void refetchBalance();
    }
    if (pulseReceipt.isError) {
      setStatus("error");
      setError(formatError(pulseReceipt.error));
    }
  }, [pulseReceipt.error, pulseReceipt.isError, pulseReceipt.isSuccess, refetchAllowance, refetchBalance]);

  const isPending =
    status === "approving" ||
    status === "pulsing" ||
    approveReceipt.isLoading ||
    pulseReceipt.isLoading;

  const isReady = hasConfig && isConnected;

  const readableDecimals = useMemo(() => {
    if (typeof decimals === "number") return decimals;
    if (typeof decimals === "bigint") return Number(decimals);
    return 18;
  }, [decimals]);

  return {
    status,
    error,
    approve,
    pulse,
    allowance: currentAllowance,
    balance: balance ?? 0n,
    minPulseAmount: minAmount,
    decimals: readableDecimals,
    symbol: symbol ?? "PULSE",
    needsApproval,
    hasConfig,
    isReady,
    isPending,
    allowanceLoading,
    balanceLoading,
  };
}
