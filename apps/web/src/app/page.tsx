"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import WalletPanel from "./components/WalletPanel";
import { Erc8004Panel } from "./components/Erc8004Panel";
import { PageHeader } from "./components/PageHeader";
import { PageFooter } from "./components/PageFooter";
import { RuntimeConfig } from "./components/RuntimeConfig";
import { CommandReference } from "./components/CommandReference";
import { RoutingSync } from "./components/RoutingSync";
import { StatusQuery } from "./components/StatusQuery";
import { PulseFeed } from "./components/PulseFeed";
import DefiPanel from "./components/DefiPanel";
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

  const fetchPulseFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError("");
    try {
      const response = await fetch(feedUrl, { cache: "no-store" });
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
        <PageHeader
          networkLabel={networkLabel}
          chainIdLabel={chainIdLabel}
          feedCacheHeader={feedCacheHeader}
          feedCacheAge={feedCacheAge}
          lastRunStatus={lastRunStatus}
          lastRunTime={lastRunTime}
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
            Approve → pulse flow. Pulses are sent to the signal sink.
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

        <PageFooter />
      </main>
    </div>
  );
}
