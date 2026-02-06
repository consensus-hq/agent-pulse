"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { isAddress, zeroAddress } from "viem";
import { publicEnv } from "../lib/env.public";
import { erc20Abi, pulseRegistryAbi } from "../lib/abi";

/* ── Types ── */

export type PulseStatus =
  | "idle"
  | "signing"     // EIP-712 permit signature in progress
  | "approving"   // on-chain approve tx in progress
  | "approved"    // approval confirmed (intermediate state)
  | "pulsing"     // pulse tx in progress
  | "confirmed"   // pulse confirmed
  | "error";

export type ApprovalMethod = "permit" | "transaction";

/* ── Constants ── */

const REFRESH_INTERVAL_MS = 15_000;
const MAX_UINT256 = 2n ** 256n - 1n;
// 1 hour from now — plenty of time for the user to submit
const PERMIT_DEADLINE_SECONDS = 3600n;

/* ── EIP-2612 Permit ABI fragment ── */

const permitAbi = [
  {
    type: "function",
    name: "permit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/* ── Helpers ── */

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

/* ── Hook ── */

export function usePulse() {
  const { address, chainId } = useAccount();
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

  /* ── Contract reads ── */

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

  // EIP-2612 nonce for permit
  const { data: permitNonce, refetch: refetchNonce } = useReadContract({
    address: safeToken,
    abi: permitAbi,
    functionName: "nonces",
    args: [safeOwner],
    query: {
      enabled: Boolean(tokenAddress && isAddress(address ?? "")),
    },
  });

  /* ── State ── */

  const [status, setStatus] = useState<PulseStatus>("idle");
  const [error, setError] = useState<string>("");
  const [approvalMethod, setApprovalMethod] = useState<ApprovalMethod>("permit");
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>();
  const [permitHash, setPermitHash] = useState<`0x${string}` | undefined>();
  const [pulseHash, setPulseHash] = useState<`0x${string}` | undefined>();
  // Flag: after approval/permit succeeds, auto-fire pulse
  const [autoPulseAfterApproval, setAutoPulseAfterApproval] = useState(false);

  /* ── Transaction receipts ── */

  const approveReceipt = useWaitForTransactionReceipt({
    hash: approveHash,
    query: { enabled: Boolean(approveHash) },
  });

  const permitReceipt = useWaitForTransactionReceipt({
    hash: permitHash,
    query: { enabled: Boolean(permitHash) },
  });

  const pulseReceipt = useWaitForTransactionReceipt({
    hash: pulseHash,
    query: { enabled: Boolean(pulseHash) },
  });

  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  /* ── Derived state ── */

  const minAmount = minPulseAmount ?? 0n;
  const currentAllowance = allowance ?? 0n;
  const hasConfig = Boolean(registryAddress && tokenAddress);
  const isConnected = Boolean(address && isAddress(address));
  const needsApproval = hasConfig && isConnected && minAmount > 0n
    ? currentAllowance < minAmount
    : false;

  /* ── Core actions ── */

  /**
   * EIP-2612 permit: gasless signature → on-chain permit() call.
   * Signs a typed EIP-712 message, then submits the permit tx.
   */
  const permitApprove = useCallback(async () => {
    if (!tokenAddress || !registryAddress || !address || !chainId) {
      setStatus("error");
      setError("Missing contract configuration or wallet not connected.");
      return false;
    }

    setStatus("signing");
    setError("");

    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + PERMIT_DEADLINE_SECONDS;
      const nonce = permitNonce ?? 0n;

      // EIP-712 typed data for permit
      const signature = await signTypedDataAsync({
        domain: {
          name: "Agent Pulse",
          version: "1",
          chainId: chainId,
          verifyingContract: tokenAddress,
        },
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message: {
          owner: address,
          spender: registryAddress,
          value: MAX_UINT256,
          nonce: nonce,
          deadline: deadline,
        },
      });

      // Parse signature components
      const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
      const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
      const v = parseInt(signature.slice(130, 132), 16);

      setStatus("approving");

      // Submit permit tx (cheap — just stores allowance, no token transfer)
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: permitAbi,
        functionName: "permit",
        args: [address, registryAddress, MAX_UINT256, deadline, v, r, s],
      });

      setPermitHash(hash);
      return true;
    } catch (err: unknown) {
      // If user rejected the signature or permit fails, don't error out hard —
      // caller can fall back to tx-based approval
      console.warn("Permit failed, falling back to tx approval:", err);
      return false;
    }
  }, [address, chainId, permitNonce, registryAddress, signTypedDataAsync, tokenAddress, writeContractAsync]);

  /**
   * Standard ERC-20 approve (on-chain transaction).
   */
  const txApprove = useCallback(async () => {
    if (!tokenAddress || !registryAddress) {
      setStatus("error");
      setError("Missing contract configuration.");
      return;
    }
    if (!minAmount || minAmount <= 0n) {
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
        args: [registryAddress, MAX_UINT256],
      });
      setApproveHash(hash);
    } catch (err) {
      setStatus("error");
      setError(formatError(err));
    }
  }, [minAmount, registryAddress, tokenAddress, writeContractAsync]);

  /**
   * Send pulse to registry.
   */
  const sendPulse = useCallback(
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

  /**
   * One-click flow: approve (permit or tx) → auto-pulse.
   * If already approved, goes straight to pulse.
   */
  const sendPulseAuto = useCallback(
    async (amount?: bigint) => {
      // Already has sufficient allowance → pulse directly
      if (!needsApproval) {
        return sendPulse(amount);
      }

      // Need approval — try permit first, fall back to tx
      setAutoPulseAfterApproval(true);

      const permitSucceeded = await permitApprove();
      if (!permitSucceeded) {
        // Permit failed (user rejected signature or token doesn't support it)
        // Fall back to standard tx-based approval
        setApprovalMethod("transaction");
        await txApprove();
      } else {
        setApprovalMethod("permit");
      }
    },
    [needsApproval, permitApprove, sendPulse, txApprove]
  );

  /* ── Receipt watchers — auto-chain approval → pulse ── */

  // Standard approve tx confirmed
  useEffect(() => {
    if (approveReceipt.isSuccess) {
      setApproveHash(undefined);
      void refetchAllowance();
      if (autoPulseAfterApproval) {
        setAutoPulseAfterApproval(false);
        void sendPulse();
      } else {
        setStatus("approved");
      }
    }
    if (approveReceipt.isError) {
      setStatus("error");
      setError(formatError(approveReceipt.error));
      setAutoPulseAfterApproval(false);
    }
  }, [approveReceipt.isSuccess, approveReceipt.isError, approveReceipt.error, refetchAllowance, autoPulseAfterApproval, sendPulse]);

  // Permit tx confirmed
  useEffect(() => {
    if (permitReceipt.isSuccess) {
      setPermitHash(undefined);
      void refetchAllowance();
      void refetchNonce();
      if (autoPulseAfterApproval) {
        setAutoPulseAfterApproval(false);
        void sendPulse();
      } else {
        setStatus("approved");
      }
    }
    if (permitReceipt.isError) {
      setStatus("error");
      setError(formatError(permitReceipt.error));
      setAutoPulseAfterApproval(false);
    }
  }, [permitReceipt.isSuccess, permitReceipt.isError, permitReceipt.error, refetchAllowance, refetchNonce, autoPulseAfterApproval, sendPulse]);

  // Pulse tx confirmed
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
  }, [pulseReceipt.isSuccess, pulseReceipt.isError, pulseReceipt.error, refetchAllowance, refetchBalance]);

  /* ── Derived flags ── */

  const isPending =
    status === "signing" ||
    status === "approving" ||
    status === "pulsing" ||
    approveReceipt.isLoading ||
    permitReceipt.isLoading ||
    pulseReceipt.isLoading;

  const isReady = hasConfig && isConnected;

  const readableDecimals = useMemo(() => {
    if (typeof decimals === "number") return decimals;
    if (typeof decimals === "bigint") return Number(decimals);
    return 18;
  }, [decimals]);

  return {
    // State
    status,
    error,
    approvalMethod,
    // Actions
    approve: txApprove,         // explicit tx-based approve
    permitApprove,              // explicit permit-based approve
    pulse: sendPulse,           // explicit pulse
    sendPulseAuto,              // one-click: auto-approve → pulse
    // Data
    allowance: currentAllowance,
    balance: balance ?? 0n,
    minPulseAmount: minAmount,
    decimals: readableDecimals,
    symbol: symbol ?? "PULSE",
    // Flags
    needsApproval,
    hasConfig,
    isReady,
    isPending,
    allowanceLoading,
    balanceLoading,
  };
}
