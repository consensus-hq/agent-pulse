"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type StatusResponse = {
  address: string;
  isAlive: boolean;
  lastPulseAt: number;
  streak: number;
  hazardScore: number;
  ttlSeconds: number;
  updatedAt: number;
  error?: string;
};

type PulseFeedResponse = {
  updatedAt: number;
  cache?: { hit?: boolean; ttlSeconds?: number };
  window?: { fromBlock?: string; toBlock?: string };
  agents?: Array<{
    address: string;
    isAlive: boolean;
    lastPulseAt: number;
    streak: number;
    hazardScore: number;
  }>;
  recentPulses?: Array<{
    agent: string;
    amount: string;
    timestamp: number;
    streak: number;
    txHash?: string;
    blockNumber?: string;
  }>;
  error?: string;
};

const formatUnix = (seconds?: number) => {
  if (!seconds) return "—";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString();
};

const formatMs = (ms?: number) => {
  if (!ms) return "—";
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString();
};

export default function Home() {
  const [address, setAddress] = useState("");
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [statusPayload, setStatusPayload] = useState("");
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  const [feedData, setFeedData] = useState<PulseFeedResponse | null>(null);
  const [feedError, setFeedError] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedCacheHeader, setFeedCacheHeader] = useState("");

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleStatusQuery = useCallback(async () => {
    const trimmed = address.trim();
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
  }, [address]);

  const fetchPulseFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError("");
    try {
      const response = await fetch("/api/pulse-feed", { cache: "no-store" });
      const payload = (await response.json()) as PulseFeedResponse;
      setFeedCacheHeader(response.headers.get("x-cache") ?? "");
      if (!response.ok) {
        setFeedError(payload?.error ?? "Pulse feed unavailable.");
        setFeedData(null);
      } else {
        setFeedData(payload);
      }
    } catch {
      setFeedError("Network error.");
      setFeedData(null);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPulseFeed();
    const id = window.setInterval(() => {
      void fetchPulseFeed();
    }, 15000);
    return () => window.clearInterval(id);
  }, [fetchPulseFeed]);

  const statusCacheAge = useMemo(() => {
    if (!statusData?.updatedAt) return null;
    return Math.max(0, Math.floor((now - statusData.updatedAt) / 1000));
  }, [now, statusData?.updatedAt]);

  const feedCacheAge = useMemo(() => {
    if (!feedData?.updatedAt) return null;
    return Math.max(0, Math.floor((now - feedData.updatedAt) / 1000));
  }, [now, feedData?.updatedAt]);

  const isAlive = Boolean(statusData?.isAlive);
  const feedRows = feedData?.recentPulses?.slice(0, 8) ?? [];

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Agent Pulse debug console</p>
            <h1 className={styles.title}>Routing eligibility console</h1>
            <p className={styles.subtitle}>
              Base chain routing gate. Pulse = paid eligibility refresh (1 PULSE
              burned). No pulse → no routing.
            </p>
          </div>
          <div className={styles.statusBar}>
            <span className={styles.tag}>Live feed</span>
            <span className={styles.muted}>
              Cache: {feedCacheHeader || "—"}
            </span>
            <span className={styles.muted}>
              Feed age: {feedCacheAge !== null ? `${feedCacheAge}s` : "—"}
            </span>
          </div>
        </header>

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
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleStatusQuery();
                }
              }}
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
          <pre className={styles.output}>
            {statusPayload || "// Status payload will appear here."}
          </pre>
          <p className={styles.muted}>
            Updated at: {formatMs(statusData?.updatedAt)} | Last pulse: {" "}
            {formatUnix(statusData?.lastPulseAt)}
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Command line</h2>
            <span className={styles.muted}>Curl + cast reference</span>
          </div>
          <pre className={styles.codeBlock}>{`# status query
curl -s https://<host>/api/status/0xYourAgent

# live pulse feed
curl -s https://<host>/api/pulse-feed

# cast examples
cast call 0xRegistry "getAgentStatus(address)(bool,uint256,uint256,uint256)" 0xYourAgent --rpc-url $BASE_RPC_URL
cast call 0xRegistry "ttlSeconds()(uint256)" --rpc-url $BASE_RPC_URL
`}</pre>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Transmission</h2>
            <span className={styles.muted}>Wallet connect placeholder</span>
          </div>
          <div className={styles.row}>
            <button className={styles.buttonGhost} type="button" disabled>
              Connect wallet
            </button>
            <button className={styles.buttonGhost} type="button" disabled>
              Approve PULSE
            </button>
            <button className={styles.buttonGhost} type="button" disabled>
              Send pulse (1 PULSE)
            </button>
          </div>
          <p className={styles.muted}>
            Approve → pulse flow placeholder. Pulses are consumed at the signal
            sink.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Reputation sync</h2>
            <span className={styles.muted}>
              {isAlive ? "Eligible" : "Locked (requires alive status)"}
            </span>
          </div>
          <div className={styles.row}>
            <button
              className={styles.button}
              type="button"
              disabled={!isAlive}
            >
              Sync routing signal
            </button>
            <span className={styles.muted}>
              {isAlive
                ? "Sync enabled for alive wallets."
                : "Run status query to unlock."}
            </span>
          </div>
          <p className={styles.muted}>
            Router-only signal. This does not claim identity, quality, or AI.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Pulse feed</h2>
            <span className={styles.muted}>
              Updated: {formatMs(feedData?.updatedAt)} | TTL: {" "}
              {feedData?.cache?.ttlSeconds
                ? `${feedData.cache.ttlSeconds}s`
                : "—"}
            </span>
          </div>
          {feedLoading ? <p className={styles.muted}>Loading…</p> : null}
          {feedError ? <p className={styles.error}>{feedError}</p> : null}
          <div className={styles.feedList}>
            <div className={styles.feedHeader}>
              <span>Agent</span>
              <span>Amount</span>
              <span>Streak</span>
              <span>Timestamp</span>
            </div>
            {feedRows.length === 0 ? (
              <div className={styles.feedRow}>
                <span className={styles.muted}>No pulses yet.</span>
                <span className={styles.muted}>—</span>
                <span className={styles.muted}>—</span>
                <span className={styles.muted}>—</span>
              </div>
            ) : (
              feedRows.map((pulse, index) => (
                <div className={styles.feedRow} key={`${pulse.agent}-${index}`}>
                  <span className={styles.mono}>{pulse.agent}</span>
                  <span>{pulse.amount}</span>
                  <span>{pulse.streak}</span>
                  <span>{formatUnix(pulse.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <footer className={styles.footer}>
          <p>
            $PULSE is a utility token used to send pulse signals. A pulse is an
            activity signal only; it does not prove identity, quality, or AI.
          </p>
        </footer>
      </main>
    </div>
  );
}
