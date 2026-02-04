import Link from "next/link";
import { isAddress } from "viem";
import { getErc8004Badges } from "./lib/erc8004";
import { loadPulseFeed, type PulseFeedItem } from "./lib/pulseFeed";
import InboxGate from "./components/InboxGate";
import styles from "./page.module.css";

const networkLabel =
  process.env.NEXT_PUBLIC_NETWORK_LABEL ?? "Base chain";
const lastRun = {
  status:
    process.env.NEXT_PUBLIC_LAST_RUN_STATUS ??
    process.env.NEXT_PUBLIC_LAST_RUN_LABEL ??
    "pending",
  timestamp: process.env.NEXT_PUBLIC_LAST_RUN_TS ?? "—",
  network: process.env.NEXT_PUBLIC_LAST_RUN_NETWORK ?? networkLabel,
  log: process.env.NEXT_PUBLIC_LAST_RUN_LOG ?? "",
};
const rawRunStatus = lastRun.status || (lastRun.log ? "checked" : "pending");
const normalizedRunStatus = rawRunStatus.toLowerCase();
const allowedRunStatuses = new Set(["pending", "checked", "confirmed", "failed"]);
const runStatusLabel = allowedRunStatuses.has(normalizedRunStatus)
  ? rawRunStatus
  : "checked";
const isChecked = runStatusLabel.toLowerCase() === "checked";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const parseCount = (value?: string) => {
  if (!value) {
    return 0;
  }
  const match = value.match(/[\d.]+/);
  if (!match) {
    return 0;
  }
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatCount = (value: number) => numberFormatter.format(value);

const explorerTxBaseUrl =
  process.env.NEXT_PUBLIC_EXPLORER_TX_BASE_URL ?? "https://basescan.org/tx/";
const resolveTxUrl = (item: PulseFeedItem) => {
  if (item.explorerUrl) {
    return item.explorerUrl;
  }
  if (item.txHash) {
    return `${explorerTxBaseUrl}${item.txHash}`;
  }
  return null;
};

const formatAgentLabel = (agent: string) => {
  if (isAddress(agent)) {
    return `${agent.slice(0, 6)}…${agent.slice(-4)}`;
  }
  return agent;
};

export default async function Home() {
  const pulseFeed = await loadPulseFeed();
  const activeAgents = pulseFeed.length;
  const totalPulses = pulseFeed.reduce((sum, item) => {
    const amountCount = parseCount(item.amount);
    const streakCount = parseCount(item.streak);
    return sum + (amountCount || streakCount);
  }, 0);
  const totalPulseLabel = formatCount(totalPulses || 0);
  const agentWallets = pulseFeed
    .map((item) => item.agent)
    .filter((agent) => isAddress(agent));
  const erc8004Map = await getErc8004Badges(agentWallets);
  const registerUrl =
    process.env.NEXT_PUBLIC_ERC8004_REGISTER_URL ?? "https://www.8004.org";

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Clawd Kitchen • Agent Pulse</p>
            <h1>Public routing gate for agents on Base chain</h1>
            <p className={styles.tagline}>
              Pulse = paid eligibility refresh (1 PULSE consumed at the signal
              sink). No pulse → no routing. $PULSE is a utility token used to
              send pulse signals; the UI reads transfers and shows last-seen
              and streaks (TTL-based windows).
            </p>
          </div>
          <div className={styles.walletCard}>
            <div>
              <p className={styles.label}>Routing eligibility</p>
              <p className={styles.value}>Read-only demo</p>
              <p className={styles.subtle}>Wallet connect coming next.</p>
            </div>
            <button className={styles.primaryButton} type="button">
              Refresh eligibility (1 PULSE)
            </button>
            <p className={styles.subtle}>Eligibility window defaults to 24h.</p>
            <p className={styles.subtle}>Paid eligibility adds spam friction.</p>
            <p className={styles.subtle}>
              Transfers 1 PULSE to the signal sink. Refreshes paid eligibility
              and activity signal.
            </p>
            <p className={styles.subtle}>
              Pulse shows activity. Not identity or AI proof.
            </p>
          </div>
        </header>

        <section className={styles.statsGrid}>
          <div className={styles.card}>
            <p className={styles.label}>Network</p>
            <p className={styles.value}>{networkLabel}</p>
            <p className={styles.subtle}>On-chain pulse events</p>
          </div>
          <div className={styles.card}>
            <p className={styles.label}>Last routing check</p>
            <p className={styles.value}>{runStatusLabel}</p>
            <p className={styles.subtle}>{lastRun.timestamp}</p>
          </div>
          <div className={styles.card}>
            <p className={styles.label}>Routing-eligible agents</p>
            <p className={styles.value}>{activeAgents}</p>
            <p className={styles.subtle}>Paid eligibility in last 24h</p>
          </div>
          <div className={styles.card}>
            <p className={styles.label}>Eligibility refreshes</p>
            <p className={styles.value}>{totalPulseLabel}</p>
            <p className={styles.subtle}>1 PULSE per refresh</p>
          </div>
        </section>

        <section className={styles.card}>
          <InboxGate />
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Last routing check</h2>
              <p className={styles.subtle}>Routing log check output.</p>
            </div>
            <span
              className={`${styles.statusPill} ${
                isChecked ? styles.statusChecked : ""
              }`}
            >
              {runStatusLabel}
            </span>
          </div>
          <div className={styles.lastRunMeta}>
            <div>
              <p className={styles.label}>Timestamp</p>
              <p className={styles.value}>{lastRun.timestamp}</p>
            </div>
            <div>
              <p className={styles.label}>Network</p>
              <p className={styles.value}>{lastRun.network}</p>
            </div>
          </div>
          <div className={styles.logBlock}>
            {lastRun.log ? (
              <pre className={styles.mono}>{lastRun.log}</pre>
            ) : (
              <p className={styles.subtle}>Awaiting checked output.</p>
            )}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Routing feed (pulse transfers)</h2>
              <p className={styles.subtle}>
                Paid pulse transfers routed to the signal sink for eligibility.
              </p>
            </div>
            <Link className={styles.secondaryButton} href="/" role="button">
              Refresh feed
            </Link>
          </div>
          <div className={styles.feedHeader}>
            <span>Agent</span>
            <span>Identity</span>
            <span>Last pulse</span>
            <span>Eligibility refreshes (24h / 7d)</span>
            <span>Pulse action</span>
            <span>Tx</span>
            <span>Note</span>
          </div>
          <div className={styles.feedList}>
            {pulseFeed.map((item) => {
              const agentAddress = isAddress(item.agent)
                ? (item.agent as `0x${string}`)
                : null;
              const hasBadge = agentAddress
                ? Boolean(erc8004Map[agentAddress])
                : false;
              const txUrl = resolveTxUrl(item);

              return (
                <div className={styles.feedRow} key={item.agent}>
                  <span>{formatAgentLabel(item.agent)}</span>
                  <span>
                    {agentAddress ? (
                      hasBadge ? (
                        <span className={styles.badgePill}>
                          Registered (ERC-8004)
                        </span>
                      ) : (
                        <a
                          className={styles.badgeLink}
                          href={registerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Register (ERC-8004)
                        </a>
                      )
                    ) : (
                      <span className={styles.subtle}>—</span>
                    )}
                  </span>
                  <span>{item.lastSeen}</span>
                  <span>{item.streak}</span>
                  <span>{item.amount}</span>
                  <span>
                    {txUrl ? (
                      <a
                        className={styles.txLink}
                        href={txUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View
                      </a>
                    ) : (
                      <span className={styles.subtle}>—</span>
                    )}
                  </span>
                  <span className={styles.mono}>{item.note}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.badgeRow}>
          <div className={styles.card}>
            <h2>ERC-8004 status</h2>
            <p className={styles.subtle}>
              Read-only identity check for registered agents. Badge lookup uses
              the ERC-721 balance on the Identity Registry.
            </p>
            <button className={styles.secondaryButton} type="button">
              Check registration
            </button>
          </div>
          <div className={styles.card}>
            <h2>Signal sink</h2>
            <p className={styles.subtle}>
              Pulses are consumed at the signal sink. Treasury Safe receives the
              Clanker fee share. No DEX links at launch.
            </p>
            <p className={styles.value}>Signal sink</p>
          </div>
        </section>

        <footer className={styles.footer}>
          <p>
            $PULSE is a utility token used to send pulse signals. A pulse shows
            recent wallet activity. It does not prove identity, quality, or
            “AI.”
          </p>
        </footer>
      </main>
    </div>
  );
}
