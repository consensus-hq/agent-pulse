"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import WalletPanel from "./components/WalletPanel";
import { useAgentStatus } from "./hooks/useAgentStatus";
import { useWallet } from "./hooks/useWallet";
import styles from "./page.module.css";
import { publicEnv } from "./lib/env.public";
import { Erc8004Panel } from "./components/Erc8004Panel";

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

const formatMaybeEpoch = (value?: string) => {
  if (!value) return "—";
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return value;
  return formatUnix(parsed);
};

const shortenHash = (hash?: string) => {
  if (!hash) return "—";
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
};

export default function Home() {
  const [statusAddress, setStatusAddress] = useState("");
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [statusPayload, setStatusPayload] = useState("");
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  const [feedData, setFeedData] = useState<PulseFeedResponse | null>(null);
  const [feedError, setFeedError] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedCacheHeader, setFeedCacheHeader] = useState("");

  const [now, setNow] = useState(Date.now());

  const { address: connectedAddress } = useWallet();
  const connectedStatus = useAgentStatus(connectedAddress);
  const normalizedConnected = connectedAddress?.toLowerCase() ?? "";
  const isConnectedMatch = Boolean(connectedAddress)
    && statusAddress.trim().toLowerCase() === normalizedConnected;

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
  const reputationCooldown = isAlive ? "Rate limit: 10m (placeholder)" : "";

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Agent Pulse debug console</p>
            <h1 className={styles.title}>Routing eligibility console</h1>
            <p className={styles.subtitle}>
              Base chain routing gate. Pulse = paid eligibility refresh.
              No pulse → no routing.
            </p>
          </div>
          <div className={styles.statusBar}>
            <span className={styles.tag}>Live feed</span>
            <span className={styles.muted}>
              Network: {networkLabel} (chain {chainIdLabel || "—"})
            </span>
            <span className={styles.muted}>
              Cache: {feedCacheHeader || "—"}
            </span>
            <span className={styles.muted}>
              Feed age: {feedCacheAge !== null ? `${feedCacheAge}s` : "—"}
            </span>
            <span className={styles.muted}>
              Last run: {lastRunStatus} @ {lastRunTime}
            </span>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Runtime config</h2>
            <span className={styles.muted}>Env snapshot (public)</span>
          </div>
          <pre className={styles.output}>
            {JSON.stringify(configSnapshot, null, 2)}
          </pre>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Identity &amp; Reputation</h2>
            <span className={styles.muted}>ERC-8004 on-chain data</span>
          </div>
          <Erc8004Panel address={statusAddress || connectedAddress || ""} showPulseEligibility={true} />
        </section>

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
            Updated at: {formatMs(statusData?.updatedAt)} | Last pulse: {formatUnix(statusData?.lastPulseAt)}
          </p>
          {isConnectedMatch ? (
            <p className={styles.muted}>
              Pulse signal (connected): {connectedStatus.loading
                ? "loading…"
                : connectedStatus.isAlive
                ? "alive"
                : "stale"} | Streak: {connectedStatus.streak ?? "—"} | Hazard: {connectedStatus.hazardScore ?? "—"} | Last pulse: {formatUnix(connectedStatus.lastPulseAt ?? undefined)}
            </p>
          ) : null}
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

# viem example
const client = createPublicClient({ chain: base, transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL) })
const status = await client.readContract({
  address: process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS,
  abi: [{ name: "getAgentStatus", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }] }],
  functionName: "getAgentStatus",
  args: ["0xYourAgent"],
})

# cast examples
cast call 0xRegistry "getAgentStatus(address)(bool,uint256,uint256,uint256)" 0xYourAgent --rpc-url $BASE_RPC_URL
cast call 0xRegistry "ttlSeconds()(uint256)" --rpc-url $BASE_RPC_URL
`}</pre>
        </section>

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

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Routing sync</h2>
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
            {isAlive ? (
              <span className={styles.muted}>{reputationCooldown}</span>
            ) : null}
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
              <span>Tx</span>
            </div>
            {feedRows.length === 0 ? (
              <div className={styles.feedRow}>
                <span className={styles.muted}>No pulses yet.</span>
                <span className={styles.muted}>—</span>
                <span className={styles.muted}>—</span>
                <span className={styles.muted}>—</span>
                <span className={styles.muted}>—</span>
              </div>
            ) : (
              feedRows.map((pulse, index) => {
                const txHash = pulse.txHash ?? "";
                const txUrl = explorerTxBaseUrl && txHash
                  ? `${explorerTxBaseUrl}${txHash}`
                  : "";
                return (
                  <div className={styles.feedRow} key={`${pulse.agent}-${index}`}>
                    <span className={styles.mono}>{pulse.agent}</span>
                    <span>{pulse.amount}</span>
                    <span>{pulse.streak}</span>
                    <span>{formatUnix(pulse.timestamp)}</span>
                    {txUrl ? (
                      <a className={styles.link} href={txUrl} target="_blank" rel="noreferrer">
                        {shortenHash(txHash)}
                      </a>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </div>
                );
              })
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
