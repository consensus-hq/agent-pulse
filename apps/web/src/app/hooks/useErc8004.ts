"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getIdentityStatus,
  getReputationForAgent,
  type IdentityStatus,
  type ReputationSummary,
  type Erc8004Status,
} from "../lib/erc8004";

interface UseErc8004Options {
  refreshInterval?: number; // ms, undefined = no polling
  enabled?: boolean;
}

interface UseErc8004Result {
  // Identity
  identity: IdentityStatus | null;
  isIdentityLoading: boolean;
  identityError: string | null;

  // Reputation
  reputation: ReputationSummary | null;
  isReputationLoading: boolean;
  reputationError: string | null;

  // Combined
  status: Erc8004Status | null;
  isLoading: boolean;
  error: string | null;
  pulseEligible: boolean;

  // Actions
  refresh: () => void;
}

/**
 * Hook to fetch ERC-8004 identity and reputation data for an address
 * Uses useEffect + useState (no wagmi dependency)
 */
export function useErc8004(
  address: string | undefined | null,
  options: UseErc8004Options = {}
): UseErc8004Result {
  const { refreshInterval, enabled = true } = options;

  const [identity, setIdentity] = useState<IdentityStatus | null>(null);
  const [reputation, setReputation] = useState<ReputationSummary | null>(null);
  const [isIdentityLoading, setIsIdentityLoading] = useState(false);
  const [isReputationLoading, setIsReputationLoading] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [reputationError, setReputationError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!address || !enabled) return;

    const normalizedAddress = address.trim();
    if (!normalizedAddress) return;

    // Reset states
    setIsIdentityLoading(true);
    setIsReputationLoading(true);
    setIdentityError(null);
    setReputationError(null);

    try {
      // Fetch identity first
      const identityResult = await getIdentityStatus(normalizedAddress);
      setIdentity(identityResult);
      setIsIdentityLoading(false);

      // Fetch reputation if identity exists
      if (identityResult.isRegistered && identityResult.agentId !== undefined) {
        const reputationResult = await getReputationForAgent(identityResult.agentId);
        setReputation(reputationResult);
        setReputationError(reputationResult.error || null);
      } else {
        setReputation({
          hasReputation: false,
          feedbackCount: BigInt(0),
          summaryValue: BigInt(0),
          summaryDecimals: 0,
        });
      }
      setIsReputationLoading(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setIdentityError(errorMsg);
      setReputationError(errorMsg);
      setIsIdentityLoading(false);
      setIsReputationLoading(false);
    }
  }, [address, enabled]);

  // Initial fetch and address change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling
  useEffect(() => {
    if (!refreshInterval || !enabled) return;

    const intervalId = setInterval(fetchData, refreshInterval);
    return () => clearInterval(intervalId);
  }, [fetchData, refreshInterval, enabled]);

  const status: Erc8004Status | null = useMemo(() => {
    if (!identity) return null;
    return {
      identity,
      reputation: reputation || {
        hasReputation: false,
        feedbackCount: BigInt(0),
        summaryValue: BigInt(0),
        summaryDecimals: 0,
      },
      pulseEligible: identity.isRegistered,
    };
  }, [identity, reputation]);

  const isLoading = isIdentityLoading || isReputationLoading;
  const error = identityError || reputationError;
  const pulseEligible = identity?.isRegistered || false;

  return {
    identity,
    isIdentityLoading,
    identityError,
    reputation,
    isReputationLoading,
    reputationError,
    status,
    isLoading,
    error,
    pulseEligible,
    refresh: fetchData,
  };
}

/**
 * Hook to fetch only identity status for an address
 */
export function useIdentity(
  address: string | undefined | null,
  options: UseErc8004Options = {}
) {
  const { refreshInterval, enabled = true } = options;

  const [identity, setIdentity] = useState<IdentityStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIdentity = useCallback(async () => {
    if (!address || !enabled) return;

    const normalizedAddress = address.trim();
    if (!normalizedAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getIdentityStatus(normalizedAddress);
      setIdentity(result);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [address, enabled]);

  useEffect(() => {
    fetchIdentity();
  }, [fetchIdentity]);

  useEffect(() => {
    if (!refreshInterval || !enabled) return;

    const intervalId = setInterval(fetchIdentity, refreshInterval);
    return () => clearInterval(intervalId);
  }, [fetchIdentity, refreshInterval, enabled]);

  return {
    identity,
    isLoading,
    error,
    refresh: fetchIdentity,
  };
}

/**
 * Hook to fetch only reputation for an agent ID
 */
export function useReputation(
  agentId: bigint | undefined | null,
  options: UseErc8004Options = {}
) {
  const { refreshInterval, enabled = true } = options;

  const [reputation, setReputation] = useState<ReputationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReputation = useCallback(async () => {
    if (agentId === undefined || agentId === null || !enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getReputationForAgent(agentId);
      setReputation(result);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [agentId, enabled]);

  useEffect(() => {
    fetchReputation();
  }, [fetchReputation]);

  useEffect(() => {
    if (!refreshInterval || !enabled) return;

    const intervalId = setInterval(fetchReputation, refreshInterval);
    return () => clearInterval(intervalId);
  }, [fetchReputation, refreshInterval, enabled]);

  return {
    reputation,
    isLoading,
    error,
    refresh: fetchReputation,
  };
}

export default useErc8004;
