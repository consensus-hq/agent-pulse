"use client";

import { useCallback, useState } from "react";
import styles from "../page.module.css";
import { useWallet } from "../hooks/useWallet";
import { useAgentStatus } from "../hooks/useAgentStatus";
import { publicEnv } from "../lib/env.public";

type SyncState = "idle" | "syncing" | "success" | "error";

export function RoutingSync() {
  const { address } = useWallet();
  const status = useAgentStatus(address as `0x${string}` | undefined);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMessage, setSyncMessage] = useState("");

  // Treat "unknown" (null) as locked — we don't have chain data.
  const isAlive = status.isAlive === true;

  const handleSync = useCallback(async () => {
    if (!isAlive || !address) return;
    setSyncState("syncing");
    setSyncMessage("");

    try {
      const feedUrl = publicEnv.pulseFeedUrl || "/api/pulse-feed";
      const url = `${feedUrl}?agent=${address}&limit=1`;
      const res = await fetch(url, { cache: "no-store" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Feed unavailable" }));
        setSyncState("error");
        setSyncMessage(body?.error ?? `Feed returned ${res.status}`);
        return;
      }

      const payload = await res.json();
      const events = Array.isArray(payload.data) ? payload.data : [];

      if (events.length > 0) {
        setSyncState("success");
        setSyncMessage(
          "✅ Routing signal synced — your agent is visible in the network"
        );
      } else {
        setSyncState("error");
        setSyncMessage(
          "No pulse events found for this wallet. Broadcast a pulse first."
        );
      }
    } catch {
      setSyncState("error");
      setSyncMessage("Network error — could not reach pulse feed.");
    }
  }, [isAlive, address]);

  const buttonLabel =
    syncState === "syncing"
      ? "Syncing…"
      : syncState === "success"
        ? "✓ Synced"
        : "Sync routing signal";

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Routing sync</h2>
        <span className={styles.muted}>
          {status.isAlive === null
            ? "Unknown (RPC)"
            : isAlive
              ? "Eligible"
              : "Locked (requires alive status)"}
        </span>
      </div>
      <div className={styles.row}>
        <button
          className={styles.button}
          type="button"
          disabled={!isAlive || syncState === "syncing"}
          onClick={handleSync}
        >
          {buttonLabel}
        </button>
        <span className={styles.muted}>
          {isAlive
            ? "Enabled for alive wallets."
            : "Broadcast a pulse to become eligible."}
        </span>
      </div>
      {syncMessage && (
        <p
          className={styles.muted}
          style={{
            color:
              syncState === "success"
                ? "var(--accent)"
                : syncState === "error"
                  ? "var(--error, #f87171)"
                  : undefined,
          }}
        >
          {syncMessage}
        </p>
      )}
      <p className={styles.muted}>
        Router-only signal. This does not claim identity, quality, or AI.
      </p>
    </section>
  );
}
