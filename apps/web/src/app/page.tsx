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
import { Hero } from "./components/Hero";
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
  const lastRunStatus = publicEnv.lastRunStatus || "—";
  const lastRunTime = formatMaybeEpoch(publicEnv.lastRunTs);

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
        <Hero />
        
        <PageHeader
          networkLabel={networkLabel}
          chainIdLabel={chainIdLabel}
          feedCacheHeader={feedCacheHeader}
          feedCacheAge={feedCacheAge}
          lastRunStatus={lastRunStatus}
          lastRunTime={lastRunTime}
        />

        <div className={styles.gridContainer} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Identity Registry</h2>
              <span className={styles.tag}>ERC-8004</span>
            </div>
            <Erc8004Panel address="" showPulseEligibility={true} />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Transmission</h2>
              <span className={styles.tag}>x402 Pulse</span>
            </div>
            <WalletPanel />
          </section>
        </div>

        <StatusQuery statusCacheAge={statusCacheAge} />

        <div className={styles.gridContainer} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
           <RoutingSync isAlive={isAlive} />
           <DefiPanel />
        </div>

        <PulseFeed
          feedData={feedData}
          feedError={feedError}
          feedLoading={feedLoading}
          feedCacheAge={feedCacheAge}
          explorerTxBaseUrl={explorerTxBaseUrl}
          onRefresh={fetchPulseFeed}
        />

        <RuntimeConfig configSnapshot={configSnapshot} />
        <CommandReference />

        <details className={styles.details} style={{ marginTop: "2rem" }}>
          <summary className={styles.summary} style={{ color: "var(--accent)" }}>
            [ GLOSSARY.md ]
          </summary>
          <dl style={{ padding: "1.5rem", lineHeight: 1.8 }}>
            <dt style={{ fontWeight: 700, color: "var(--accent-bright)" }}>Pulse</dt>
            <dd style={{ marginLeft: "1rem", marginBottom: "0.5rem" }}>An on-chain transaction that refreshes your agent&apos;s liveness status</dd>
            <dt style={{ fontWeight: 700, color: "var(--accent-bright)" }}>TTL</dt>
            <dd style={{ marginLeft: "1rem", marginBottom: "0.5rem" }}>Time To Live — how long a pulse keeps your agent marked as active</dd>
            <dt style={{ fontWeight: 700, color: "var(--accent-bright)" }}>Routing eligibility</dt>
            <dd style={{ marginLeft: "1rem", marginBottom: "0.5rem" }}>Whether your agent can be discovered and routed to by other agents</dd>
          </dl>
        </details>

        <PageFooter />
      </main>
    </div>
  );
}
