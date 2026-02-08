"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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

/* ───────────────────────────────────────────────────────────
 *  Navigation Bar
 * ─────────────────────────────────────────────────────────── */
function NavBar() {
  const links = [
    { label: "Docs", href: "/docs" },
    { label: "GitHub", href: "https://github.com/consensus-hq/agent-pulse", external: true },
    { label: "npm", href: "https://www.npmjs.com/package/@agent-pulse/sdk", external: true },
    { label: "DexScreener", href: "https://dexscreener.com/base/0x21111B39A502335aC7e45c4574Dd083A69258b07", external: true },
  ];

  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: "6px 20px",
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
        marginBottom: "8px",
        fontSize: "12px",
        fontFamily: "inherit",
        letterSpacing: "1px",
        textTransform: "uppercase",
      }}
    >
      {links.map((l, i) => {
        const linkStyle = {
          color: "var(--accent)",
          textDecoration: "none" as const,
          transition: "color 0.15s",
        };
        const content = (
          <>
            [{l.label}]
            {i < links.length - 1 && (
              <span style={{ color: "var(--border-strong)", marginLeft: "20px", userSelect: "none" }}>·</span>
            )}
          </>
        );
        return l.external ? (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-bright, #86efac)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--accent)")}
          >
            {content}
          </a>
        ) : (
          <Link
            key={l.label}
            href={l.href}
            style={linkStyle}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-bright, #86efac)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--accent)")}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

/* ───────────────────────────────────────────────────────────
 *  Get Started Cards
 * ─────────────────────────────────────────────────────────── */
function GetStartedCards() {
  const [copied, setCopied] = useState<number | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://agent-pulse-nine.vercel.app";

  const cards = [
    {
      title: "API",
      tag: "REST",
      command: `curl ${origin}/api/v2/agent/0xYOUR_ADDR/alive`,
      description: "Free. No auth. JSON response.",
    },
    {
      title: "npm SDK",
      tag: "TypeScript",
      command: "npm install @agent-pulse/sdk",
      description: "TypeScript SDK. One-line alive check.",
    },
    {
      title: "OpenClaw Skill",
      tag: "Agent",
      command: "clawhub install agent-pulse",
      description: "Auto-pulse from any OpenClaw agent.",
    },
  ];

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(index);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <h2
        style={{
          margin: 0,
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "4px",
          color: "var(--dim)",
        }}
      >
        $ get-started
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "16px",
        }}
      >
        {cards.map((card, i) => (
          <div
            key={card.title}
            style={{
              border: "1px solid var(--border)",
              background: "var(--panel)",
              borderRadius: "4px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              position: "relative",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--border-strong)";
              e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--accent)",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                {card.title}
              </span>
              <span
                style={{
                  background: "var(--accent-dim)",
                  color: "var(--accent)",
                  padding: "2px 8px",
                  borderRadius: "2px",
                  fontSize: "10px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {card.tag}
              </span>
            </div>

            <div
              onClick={() => handleCopy(card.command, i)}
              title="Click to copy"
              style={{
                background: "#050805",
                border: "1px solid var(--border-subtle)",
                borderRadius: "4px",
                padding: "12px",
                fontSize: "11px",
                lineHeight: 1.5,
                color: "var(--accent-bright)",
                overflowX: "auto",
                cursor: "pointer",
                position: "relative",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ color: "var(--muted)", userSelect: "none" }}>$ </span>
              {card.command}
              {copied === i && (
                <span
                  style={{
                    position: "absolute",
                    top: "4px",
                    right: "8px",
                    fontSize: "10px",
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  copied ✓
                </span>
              )}
            </div>

            <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
              {card.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────
 *  Stats Bar
 * ─────────────────────────────────────────────────────────── */
function StatsBar() {
  const stats = [
    { value: "50+", label: "registered agents" },
    { value: "8.7K+", label: "API requests" },
    { value: "15", label: "endpoints" },
    { value: "7", label: "x402-paid" },
  ];

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: "8px 24px",
        padding: "12px 16px",
        background: "var(--panel-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "4px",
        fontSize: "11px",
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      {stats.map((s, i) => (
        <span key={s.label}>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>{s.value}</span>{" "}
          {s.label}
          {i < stats.length - 1 && (
            <span style={{ marginLeft: "24px", color: "var(--border-strong)", userSelect: "none" }}>·</span>
          )}
        </span>
      ))}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
 *  Page
 * ─────────────────────────────────────────────────────────── */
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

        {/* Navigation */}
        <NavBar />

        {/* Get Started */}
        <GetStartedCards />

        {/* Stats */}
        <StatsBar />

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
