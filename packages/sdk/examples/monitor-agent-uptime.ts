/**
 * monitor-agent-uptime.ts
 *
 * Continuously monitors an agent's liveness and logs state transitions.
 * Demonstrates how to build an uptime dashboard or alert system on top of Agent Pulse.
 *
 * Usage:
 *   npx tsx examples/monitor-agent-uptime.ts
 *   npx tsx examples/monitor-agent-uptime.ts 0xYourAgent 30
 *
 *   Args: [address] [intervalSeconds]
 */

import { AgentPulse, AgentPulseError, type AgentStatus } from "../src/index.js";

// ── Config ──────────────────────────────────────────────────────────
const AGENT_ADDRESS = (process.argv[2] ??
  "0x9508752Ba171D37EBb3AA437927458E0a21D1e04") as `0x${string}`;
const POLL_INTERVAL_SEC = parseInt(process.argv[3] ?? "60", 10);
const MAX_POLLS = 100; // safety limit for demo — remove in production

// ── State ───────────────────────────────────────────────────────────
interface UptimeRecord {
  pollCount: number;
  aliveCount: number;
  deadCount: number;
  errorCount: number;
  lastAlive: boolean | null;
  transitions: { time: string; from: string; to: string }[];
  startedAt: Date;
}

const record: UptimeRecord = {
  pollCount: 0,
  aliveCount: 0,
  deadCount: 0,
  errorCount: 0,
  lastAlive: null,
  transitions: [],
  startedAt: new Date(),
};

// ── Helpers ─────────────────────────────────────────────────────────
function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function uptimePercent(): string {
  if (record.pollCount === 0) return "—";
  return ((record.aliveCount / record.pollCount) * 100).toFixed(1) + "%";
}

function formatStaleness(status: AgentStatus): string {
  const staleSec = Math.floor(Date.now() / 1000) - status.lastPulse;
  if (staleSec < 60) return `${staleSec}s`;
  if (staleSec < 3600) return `${Math.floor(staleSec / 60)}m`;
  return `${(staleSec / 3600).toFixed(1)}h`;
}

// ── Main Loop ───────────────────────────────────────────────────────
async function main() {
  const pulse = new AgentPulse();

  console.log("📊 Agent Pulse — Uptime Monitor\n");
  console.log(`  Agent:    ${AGENT_ADDRESS}`);
  console.log(`  Interval: ${POLL_INTERVAL_SEC}s`);
  console.log(`  Started:  ${timestamp()}`);
  console.log(`\n${"─".repeat(72)}`);
  console.log(
    `${"Time".padEnd(22)} ${"Status".padEnd(10)} ${"Streak".padEnd(8)} ${"Stale".padEnd(8)} ${"Uptime".padEnd(8)}`
  );
  console.log("─".repeat(72));

  for (let i = 0; i < MAX_POLLS; i++) {
    record.pollCount++;

    try {
      const status = await pulse.getStatus(AGENT_ADDRESS);
      const alive = status.alive;

      // Track uptime
      if (alive) {
        record.aliveCount++;
      } else {
        record.deadCount++;
      }

      // Detect state transition
      if (record.lastAlive !== null && record.lastAlive !== alive) {
        const from = record.lastAlive ? "alive" : "dead";
        const to = alive ? "alive" : "dead";
        record.transitions.push({ time: timestamp(), from, to });

        // 🔔 Alert on transition
        const icon = alive ? "🟢" : "🔴";
        console.log(`\n  ${icon} STATE CHANGE: ${from} → ${to} at ${timestamp()}\n`);
      }
      record.lastAlive = alive;

      // Log poll
      const icon = alive ? "💓" : "💀";
      const stale = formatStaleness(status);
      console.log(
        `${timestamp().padEnd(22)} ${icon} ${(alive ? "alive" : "dead").padEnd(7)} ${String(status.streak).padEnd(8)} ${stale.padEnd(8)} ${uptimePercent()}`
      );
    } catch (err) {
      record.errorCount++;
      const msg =
        err instanceof AgentPulseError
          ? `[${err.code}] ${err.message}`
          : String(err);
      console.log(`${timestamp().padEnd(22)} ⚠️ error   ${"—".padEnd(8)} ${"—".padEnd(8)} ${uptimePercent()}`);
      console.log(`  └─ ${msg}`);
    }

    // Wait for next poll (unless last iteration)
    if (i < MAX_POLLS - 1) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_SEC * 1000));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(72)}`);
  console.log("\n📊 Session Summary:");
  console.log(`  Duration:     ${((Date.now() - record.startedAt.getTime()) / 1000).toFixed(0)}s`);
  console.log(`  Polls:        ${record.pollCount}`);
  console.log(`  Alive:        ${record.aliveCount}`);
  console.log(`  Dead:         ${record.deadCount}`);
  console.log(`  Errors:       ${record.errorCount}`);
  console.log(`  Uptime:       ${uptimePercent()}`);
  console.log(`  Transitions:  ${record.transitions.length}`);

  if (record.transitions.length > 0) {
    console.log("\n  State transitions:");
    for (const t of record.transitions) {
      console.log(`    ${t.time}: ${t.from} → ${t.to}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
