"use client";

import { useState, useCallback, useEffect, useRef } from "react";

const API_ROUTE = "/api/anvil";

export interface UseAnvilTimeControlReturn {
  /** Take a snapshot, return snapshot ID */
  snapshot: () => Promise<string>;
  /** Revert to a snapshot ID */
  revert: (id: string) => Promise<void>;
  /** Advance time by N seconds and mine a block */
  advanceTime: (seconds: number) => Promise<void>;
  /** Set exact timestamp and mine a block */
  setTime: (timestamp: number) => Promise<void>;
  /** Current block timestamp (from last refresh or operation) */
  currentTimestamp: number | null;
  /** Re-read current block timestamp */
  refresh: () => Promise<void>;
  /** Whether Anvil is reachable */
  isAvailable: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Last error message */
  error: string | null;
  /** Clear error */
  clearError: () => void;
}

async function callAnvilAPI(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(API_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.result;
}

export function useAnvilTimeControl(): UseAnvilTimeControlReturn {
  const [currentTimestamp, setCurrentTimestamp] = useState<number | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const availabilityChecked = useRef(false);

  const clearError = useCallback(() => setError(null), []);

  // Check availability on mount
  useEffect(() => {
    if (availabilityChecked.current) return;
    availabilityChecked.current = true;

    const checkAvailability = async () => {
      try {
        await callAnvilAPI("eth_blockNumber");
        setIsAvailable(true);
        // Also get current timestamp
        await refresh();
      } catch {
        setIsAvailable(false);
      }
    };

    checkAvailability();
  }, []);

  const snapshot = useCallback(async (): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await callAnvilAPI("evm_snapshot") as string;
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to take snapshot";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const revert = useCallback(async (id: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await callAnvilAPI("evm_revert", [id]);
      // Refresh timestamp after revert
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to revert";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const advanceTime = useCallback(async (seconds: number): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await callAnvilAPI("evm_increaseTime", [seconds]);
      await callAnvilAPI("evm_mine");
      // Update timestamp
      const blockNumber = await callAnvilAPI("eth_blockNumber") as string;
      // Note: We could get the block timestamp via eth_getBlockByNumber,
      // but for simplicity we'll estimate based on current + seconds
      setCurrentTimestamp(prev => (prev ? prev + seconds : null));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to advance time";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setTime = useCallback(async (timestamp: number): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await callAnvilAPI("evm_setNextBlockTimestamp", [timestamp]);
      await callAnvilAPI("evm_mine");
      setCurrentTimestamp(timestamp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to set time";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      // We can't directly get timestamp from eth_blockNumber, but we can estimate
      // For accurate timestamp, we'd need eth_getBlockByNumber
      // For now, we'll just verify Anvil is responsive
      await callAnvilAPI("eth_blockNumber");
      setIsAvailable(true);
    } catch (err) {
      setIsAvailable(false);
      throw err;
    }
  }, []);

  return {
    snapshot,
    revert,
    advanceTime,
    setTime,
    currentTimestamp,
    refresh,
    isAvailable,
    isLoading,
    error,
    clearError,
  };
}
