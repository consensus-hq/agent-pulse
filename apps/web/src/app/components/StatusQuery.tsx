"use client";

import { useState, useCallback } from "react";
import { StatusResponse } from "../lib/types";
import { formatMs, formatUnix } from "../lib/format";
import { useAgentStatus } from "../hooks/useAgentStatus";
import { useWallet } from "../hooks/useWallet";
import styles from "../page.module.css";

interface StatusQueryProps {
  statusCacheAge: number | null;
}

export function StatusQuery({ statusCacheAge }: StatusQueryProps) {
  const [statusAddress, setStatusAddress] = useState("");
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [statusPayload, setStatusPayload] = useState("");
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  const { address: connectedAddress } = useWallet();
  const connectedStatus = useAgentStatus(connectedAddress);
  const normalizedConnected = connectedAddress?.toLowerCase() ?? "";
  const isConnectedMatch = Boolean(connectedAddress)
    && statusAddress.trim().toLowerCase() === normalizedConnected;

  const isAlive = Boolean(statusData?.isAlive);

  const handleStatusQuery = useCallback(async () => {
    const trimmed = statusAddress.trim();
    setStatusError("");
    setStatusData(null);
    setStatusPayload("");

    if (!trimmed) {
      setStatusError("Address required.");
      setStatusPayload("// Enter a wallet address to query status.");
      return;
    }

    setStatusLoading(true);
    try {
      const response = await fetch(`/api/status/${trimmed}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as StatusResponse;
      setStatusPayload(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        setStatusError(payload?.error ?? "Status query failed.");
        setStatusData(null);
      } else {
        setStatusData(payload);
      }
    } catch {
      const errorPayload = { error: "Network error" };
      setStatusPayload(JSON.stringify(errorPayload, null, 2));
      setStatusError("Network error.");
      setStatusData(null);
    } finally {
      setStatusLoading(false);
    }
  }, [statusAddress]);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Status query</h2>
        <span className={styles.muted}>
          Cache age: {statusCacheAge !== null ? `${statusCacheAge}s` : "—"}
        </span>
      </div>
      <div className={styles.row}>
        <input
          className={styles.input}
          placeholder="0x..."
          value={statusAddress}
          onChange={(event) => setStatusAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleStatusQuery();
            }
          }}
          aria-label="Agent wallet address"
        />
        <button
          className={styles.button}
          type="button"
          onClick={() => void handleStatusQuery()}
          disabled={statusLoading}
        >
          {statusLoading ? "Querying…" : "Query"}
        </button>
        <span className={styles.muted}>
          TTL: {statusData?.ttlSeconds ? `${statusData.ttlSeconds}s` : "—"}
        </span>
        <span className={styles.muted}>
          Alive: {statusData ? (statusData.isAlive ? "yes" : "no") : "—"}
        </span>
      </div>
      {statusError ? (
        <p className={styles.error}>{statusError}</p>
      ) : null}
      <pre className={styles.output} aria-live="polite" role="status">
        {statusPayload || "// Status payload will appear here."}
      </pre>
      <p className={styles.muted}>
        Updated at: {formatMs(statusData?.updatedAt)} | Last pulse: {formatUnix(statusData?.lastPulseAt)}
      </p>
      {isConnectedMatch ? (
        <p className={styles.muted}>
          Pulse signal (connected): {connectedStatus.loading
            ? "loading…"
            : connectedStatus.isAlive === null
            ? "unknown"
            : connectedStatus.isAlive
            ? "alive"
            : "stale"} | Streak: {connectedStatus.streak ?? "—"} | Hazard: {connectedStatus.hazardScore ?? "—"} | Last pulse: {formatUnix(connectedStatus.lastPulseAt ?? undefined)}
        </p>
      ) : null}
    </section>
  );
}
