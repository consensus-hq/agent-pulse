"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { StatusResponse } from "../lib/types";
import { formatUnix } from "../lib/format";
import { useAgentStatus } from "../hooks/useAgentStatus";
import { useWallet } from "../hooks/useWallet";
import styles from "../page.module.css";

export function StatusQuery() {
  const [statusAddress, setStatusAddress] = useState("");
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [statusPayload, setStatusPayload] = useState("");
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  const { address: connectedAddress } = useWallet();
  const connectedStatus = useAgentStatus(connectedAddress);
  const normalizedConnected = connectedAddress?.toLowerCase() ?? "";
  const isConnectedMatch = Boolean(connectedAddress)
    && statusAddress.trim().toLowerCase() === normalizedConnected;

  // Tick every second so cache age stays live
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Derive cache age from local statusData (was previously broken — always null from parent)
  const statusCacheAge = useMemo(() => {
    if (!statusData?.updatedAt) return null;
    return Math.max(0, Math.floor((now - statusData.updatedAt) / 1000));
  }, [now, statusData?.updatedAt]);

  const handleStatusQuery = useCallback(async () => {
    const trimmed = statusAddress.trim();
    setStatusError("");
    setStatusData(null);
    setStatusPayload("");

    if (!trimmed) {
      setStatusError("AGENT ADDRESS REQUIRED");
      return;
    }

    setStatusLoading(true);
    try {
      const response = await fetch(`/api/status/${trimmed}`, { cache: "no-store" });
      const payload = (await response.json()) as StatusResponse;
      setStatusPayload(JSON.stringify(payload, null, 2));
      if (!response.ok) {
        setStatusError(payload?.error ?? "QUERY FAILED");
      } else {
        setStatusData(payload);
      }
    } catch {
      setStatusError("NETWORK_TIMEOUT");
    } finally {
      setStatusLoading(false);
    }
  }, [statusAddress]);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Agent Lookup</h2>
        <span className={styles.muted}>
          TTL: {statusData?.ttlSeconds ? `${statusData.ttlSeconds}s` : "—"}
        </span>
      </div>
      
      <div className={styles.row}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', fontSize: '12px' }}>$</span>
          <input
            className={styles.input}
            style={{ paddingLeft: '28px' }}
            placeholder="Agent wallet address (0x...)"
            aria-label="Agent wallet address"
            value={statusAddress}
            onChange={(e) => setStatusAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleStatusQuery()}
          />
        </div>
        <button
          className={styles.button}
          onClick={() => void handleStatusQuery()}
          disabled={statusLoading}
        >
          {statusLoading ? "BUSY..." : "QUERY"}
        </button>
      </div>

      {statusError && <p className={styles.error} style={{ margin: '8px 0' }}>!! ERROR: {statusError}</p>}
      
      <div style={{ position: 'relative' }}>
        <pre className={styles.output} style={{ minHeight: '100px', border: '1px solid var(--accent-dim)', background: '#050805' }}>
          {statusPayload || "// WAITING FOR INPUT..."}
        </pre>
        {statusData && (
          <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
             <span className={statusData.isAlive ? styles.successText : styles.error} style={{ fontSize: '10px', fontWeight: 800 }}>
               [{statusData.isAlive ? "ONLINE" : "OFFLINE"}]
             </span>
          </div>
        )}
      </div>

      <div className={styles.row} style={{ justifyContent: 'space-between', fontSize: '10px' }}>
        <span className={styles.muted}>CACHE_AGE: {statusCacheAge ?? 0}s</span>
        <span className={styles.muted}>LAST_PULSE: {formatUnix(statusData?.lastPulseAt)}</span>
      </div>

      {isConnectedMatch && !connectedStatus.loading && (
        <div style={{ marginTop: '1rem', padding: '12px', border: '1px solid var(--accent-muted)', borderRadius: '4px', background: 'rgba(74, 222, 128, 0.05)' }}>
           <p className={styles.muted} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
             OWNER VIEW: STREAK={connectedStatus.streak} | HAZARD={connectedStatus.hazardScore || 0}
           </p>
        </div>
      )}
    </section>
  );
}
