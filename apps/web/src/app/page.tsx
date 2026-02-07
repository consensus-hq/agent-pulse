"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WalletPanel from "./components/WalletPanel";
import { Erc8004Panel } from "./components/Erc8004Panel";
import { PageHeader } from "./components/PageHeader";
import { PageFooter } from "./components/PageFooter";
import { RuntimeConfig } from "./components/RuntimeConfig";
import { CommandReference } from "./components/CommandReference";
import { RoutingSync } from "./components/RoutingSync";
import { StatusQuery } from "./components/StatusQuery";
import { PulseFeed } from "./components/PulseFeed";
const DefiPanel = dynamic(() => import("./components/DefiPanel"), { ssr: false });
import { PulseFeedResponse, StatusResponse } from "./lib/types";
import { formatMaybeEpoch } from "./lib/format";
import styles from "./page.module.css";
import { publicEnv } from "./lib/env.public";

export default function Home() {
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [feedData, setFeedData] = useState<PulseFeedResponse | null>(null);
  const [feedError, setFeedError] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedCacheHeader, setFeedCacheHeader] = useState("");
  const [now, setNow] = useState(Date.now());

  const networkLabel = publicEnv.networkLabel || "Base chain";
  const chainIdLabel = publicEnv.chainId || "—";
  const walletConnectStatus = publicEnv.walletConnectProjectId
    ? "configured"
    : "unset";
  const explorerTxBaseUrl = publicEnv.explorerTxBaseUrl || "";
  const feedUrl = publicEnv.pulseFeedUrl || "/api/pulse-feed";
  const lastRunStatus = publicEnv.lastRunStatus || "";
  const lastRunTime = formatMaybeEpoch(publicEnv.lastRunTs);

  // Derive live stats from feed data
  const totalAgents = feedData?.pagination?.totalEvents ?? feedData?.data?.length ?? 0;
  const latestPulseTime = feedData?.data?.[0]?.timestampFormatted
    ? new Date(feedData.data[0].timestampFormatted).toLocaleTimeString()
    : undefined;

  const configSnapshot = useMemo(
    () => ({
      network: networkLabel,
      chainId: chainIdLabel,
      walletConnect: walletConnectStatus,
      treasurySafe: publicEnv.treasurySafeAddress || "—",
      signalSink: publicEnv.signalSinkAddress || "—",
      pulseToken: publicEnv.pulseTokenAddress || "—",
      pulseRegistry: publicEnv.pulseRegistryAddress || "—",
      identityRegistry: publicEnv.identityRegistryAddress || "—",
      reputationRegistry: publicEnv.reputationRegistryAddress || "—",
      explorerTxBaseUrl: publicEnv.explorerTxBaseUrl || "—",
      erc8004RegisterUrl: publicEnv.erc8004RegisterUrl || "—",
      lastRunLabel: publicEnv.lastRunLabel || "—",
    }),
    [chainIdLabel, networkLabel, walletConnectStatus]
  );

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const feedInitialLoad = useRef(true);
  const fetchPulseFeed = useCallback(async () => {
    // Only show loading spinner on initial load, not refreshes
    if (feedInitialLoad.current) {
      setFeedLoading(true);
    }
    setFeedError("");
    try {
      const response = await fetch(feedUrl, { cache: "no-store" });
      const payload = (await response.json()) as PulseFeedResponse;
      setFeedCacheHeader(response.headers.get("x-cache") ?? "");
      if (!response.ok) {
        setFeedError(payload?.error ?? "Pulse feed unavailable.");
        setFeedData(null);
      } else {
        // Map meta.timestamp (seconds) to updatedAt (ms) if not present
        if (!payload.updatedAt && payload.meta?.timestamp) {
          payload.updatedAt = payload.meta.timestamp * 1000;
        }
        setFeedData(payload);
      }
    } catch {
      setFeedError("Network error.");
      setFeedData(null);
    } finally {
      setFeedLoading(false);
      feedInitialLoad.current = false;
    }
  }, [feedUrl]);

  useEffect(() => {
    void fetchPulseFeed();
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

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {/* Hero Block */}
        <div style={{ textAlign: "center", margin: "0 auto 2rem", maxWidth: 640 }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, color: "#e5e5e5", marginBottom: "0.5rem", letterSpacing: "-0.02em" }}>
            Heartbeat for AI agents
          </h1>
          <p style={{ color: "#888", fontSize: "0.9rem", lineHeight: 1.6, margin: "0 auto 1.5rem" }}>
            Periodic x402 pulses prove liveness. Send tokens → agents stay routable.
            On-chain, verifiable, spam-resistant.{" "}
            <a href="https://github.com/consensus-hq/agent-pulse" target="_blank" rel="noopener noreferrer" style={{ color: "#999", textDecoration: "underline" }}>
              GitHub ↗
            </a>
          </p>
        </div>

        {/* How It Works */}
        <details style={{ margin: "0 auto 2rem", maxWidth: 640, fontSize: "0.8rem", color: "#666" }}>
          <summary style={{ cursor: "pointer", fontWeight: 500, color: "#888", fontFamily: "var(--font-mono), monospace" }}>
            $ how-it-works
          </summary>
          <pre style={{
            marginTop: "0.75rem",
            padding: "1rem",
            background: "#0a0a0a",
            border: "1px solid #222",
            borderRadius: "4px",
            overflow: "auto",
            fontFamily: "var(--font-mono), monospace",
            fontSize: "0.75rem",
            lineHeight: 1.6,
            color: "#aaa"
          }}>
{`1. Agent POST /api/pulse
   → No payment attached

2. Server: 402 Payment Required
   → Returns x402 payload (amount + payTo)

3. Agent pays via x402
   → PULSE token → burn address (0xdead)
   → EIP-712 permit signature

4. Agent resends with proof
   → POST /api/pulse + PAYMENT-SIGNATURE header

5. Server: 200 OK
   → Pulse recorded, agent marked alive
   → TTL refreshed, streak updated`}
          </pre>
        </details>
        <PageHeader
          networkLabel={networkLabel}
          chainIdLabel={chainIdLabel}
          feedCacheHeader={feedCacheHeader}
          feedCacheAge={feedCacheAge}
          lastRunStatus={lastRunStatus}
          lastRunTime={lastRunTime}
          totalAgents={totalAgents}
          latestPulseTime={latestPulseTime}
        />

        <RuntimeConfig configSnapshot={configSnapshot} />

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Identity &amp; Reputation</h2>
            <span className={styles.muted}>ERC-8004 on-chain data</span>
          </div>
          <Erc8004Panel address="" showPulseEligibility={true} />
        </section>

        <StatusQuery statusCacheAge={statusCacheAge} />

        <CommandReference />

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Transmission</h2>
            <span className={styles.muted}>Wallet connect flow</span>
          </div>
          <WalletPanel />
          <p className={styles.muted}>
            One-click pulse with EIP-2612 permit signing. No separate approval needed.
          </p>
        </section>

        <RoutingSync isAlive={isAlive} />

        <DefiPanel />

        <PulseFeed
          feedData={feedData}
          feedError={feedError}
          feedLoading={feedLoading}
          feedCacheAge={feedCacheAge}
          explorerTxBaseUrl={explorerTxBaseUrl}
          onRefresh={fetchPulseFeed}
        />

        <details style={{ marginTop: "2rem", fontSize: "0.85rem", color: "#888", maxWidth: 600 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: "#aaa" }}>Glossary</summary>
          <dl style={{ marginTop: "0.5rem", lineHeight: 1.6 }}>
            <dt style={{ fontWeight: 600, color: "#ccc" }}>Pulse</dt>
            <dd style={{ marginLeft: "1rem", marginBottom: "0.5rem" }}>An on-chain transaction that refreshes your agent&apos;s liveness status</dd>
            <dt style={{ fontWeight: 600, color: "#ccc" }}>TTL</dt>
            <dd style={{ marginLeft: "1rem", marginBottom: "0.5rem" }}>Time To Live — how long a pulse keeps your agent marked as active</dd>
            <dt style={{ fontWeight: 600, color: "#ccc" }}>Routing eligibility</dt>
            <dd style={{ marginLeft: "1rem", marginBottom: "0.5rem" }}>Whether your agent can be discovered and routed to by other agents</dd>
            <dt style={{ fontWeight: 600, color: "#ccc" }}>Signal sink</dt>
            <dd style={{ marginLeft: "1rem", marginBottom: "0.5rem" }}>The burn address (0xdead) where pulse tokens are sent</dd>
            <dt style={{ fontWeight: 600, color: "#ccc" }}>ERC-8004</dt>
            <dd style={{ marginLeft: "1rem", marginBottom: "0.5rem" }}>A proposed standard for on-chain agent identity</dd>
          </dl>
        </details>

        <PageFooter />
      </main>
    </div>
  );
}
