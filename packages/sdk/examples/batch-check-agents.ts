/**
 * batch-check-agents.ts
 *
 * Check liveness for a list of agent addresses in parallel.
 * Useful for routers that need to filter alive agents before task assignment.
 *
 * Usage:
 *   npx tsx examples/batch-check-agents.ts
 */

import { AgentPulse, type AgentStatus } from "../src/index.js";

// ── Config ──────────────────────────────────────────────────────────
// Addresses to check — replace with your own fleet
const AGENT_ADDRESSES: `0x${string}`[] = [
  "0x9508752Ba171D37EBb3AA437927458E0a21D1e04",
  "0x0000000000000000000000000000000000000001", // never pulsed → dead
  "0x000000000000000000000000000000000000dEaD", // burn address → dead
];

interface AgentResult {
  address: string;
  alive: boolean;
  status: AgentStatus | null;
  error: string | null;
  latencyMs: number;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍 Agent Pulse — Batch Liveness Check\n");
  console.log(`Checking ${AGENT_ADDRESSES.length} agents in parallel...\n`);

  const pulse = new AgentPulse();
  const startAll = Date.now();

  // Fire all checks concurrently
  const results: AgentResult[] = await Promise.all(
    AGENT_ADDRESSES.map(async (address): Promise<AgentResult> => {
      const start = Date.now();
      try {
        const status = await pulse.getStatus(address);
        return {
          address,
          alive: status.alive,
          status,
          error: null,
          latencyMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          address,
          alive: false,
          status: null,
          error: err.message ?? String(err),
          latencyMs: Date.now() - start,
        };
      }
    })
  );

  const totalMs = Date.now() - startAll;

  // ── Display results ─────────────────────────────────────────────
  const aliveCount = results.filter((r) => r.alive).length;
  const deadCount = results.length - aliveCount;

  console.log("─".repeat(80));
  console.log(
    `${"Address".padEnd(44)} ${"Status".padEnd(8)} ${"Streak".padEnd(8)} ${"Latency".padEnd(10)}`
  );
  console.log("─".repeat(80));

  for (const r of results) {
    const addr = `${r.address.slice(0, 6)}…${r.address.slice(-4)}`;
    const icon = r.alive ? "💓" : "💀";
    const streak = r.status ? `${r.status.streak}d` : "—";
    const latency = `${r.latencyMs}ms`;

    console.log(
      `${r.address.padEnd(44)} ${icon} ${r.alive ? "alive" : "dead "}   ${streak.padEnd(8)} ${latency}`
    );

    if (r.error) {
      console.log(`  └─ error: ${r.error}`);
    }
  }

  console.log("─".repeat(80));
  console.log(
    `\nSummary: ${aliveCount} alive, ${deadCount} dead — ${totalMs}ms total`
  );

  // ── Filter alive (what a router would do) ───────────────────────
  const aliveAgents = results.filter((r) => r.alive).map((r) => r.address);
  console.log(`\nRoutable agents: [${aliveAgents.join(", ")}]`);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
