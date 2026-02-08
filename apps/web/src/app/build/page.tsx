"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

/* ================================================================
   Agent Pulse — Build on Agent Pulse (Developer Portal)
   ================================================================
   /build — developer-facing page showing how to compose on top
   of the Agent Pulse liveness primitive. Code snippets, use-case
   cards, and integration flow.
   ================================================================ */

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const CONTRACTS = {
  PulseToken: "0x21111B39A502335aC7e45c4574Dd083A69258b07",
  PulseRegistry: "0xe61C615743A02983A46aFF66Db035297e8a43846",
  BurnWithFee: "0xd38cC332ca9755DE536841f2A248f4585Fb08C1E",
  PeerAttestation: "0x930dC6130b20775E01414a5923e7C66b62FF8d6C",
} as const;

const BASESCAN = "https://basescan.org/address";

const LINKS = {
  npm: "https://www.npmjs.com/package/@agent-pulse/sdk",
  github: "https://github.com/consensus-hq/agent-pulse",
  docs: "/docs",
};

// ────────────────────────────────────────────
// Flow steps
// ────────────────────────────────────────────

interface FlowStep {
  num: number;
  title: string;
  description: string;
  code: string;
  tag: string;
}

const FLOW_STEPS: FlowStep[] = [
  {
    num: 1,
    title: "Read liveness",
    description:
      "Query any agent's on-chain liveness status. Is it alive? How long has its streak been? When was its last pulse?",
    code: "registry.getAgentStatus(address)",
    tag: "PulseRegistry",
  },
  {
    num: 2,
    title: "Gate actions",
    description:
      "Use liveness data as a gate. Require agents to be alive, or enforce a minimum streak before they can participate.",
    code: "require(isAlive && streak >= threshold)",
    tag: "Modifier",
  },
  {
    num: 3,
    title: "Compose attestations",
    description:
      "Let agents vouch for each other. Peer attestations create a web-of-trust reputation layer on top of liveness.",
    code: "peerAttestation.attest(agent, score)",
    tag: "PeerAttestation",
  },
  {
    num: 4,
    title: "Burn with purpose",
    description:
      "Integrate deflationary burn mechanics into your product. Every burn reduces supply and routes a fee to the protocol.",
    code: "burnWithFee.burn(amount)",
    tag: "BurnWithFee",
  },
];

// ────────────────────────────────────────────
// Use-case cards
// ────────────────────────────────────────────

interface UseCase {
  title: string;
  description: string;
  icon: string;
  difficulty: "Starter" | "Intermediate" | "Advanced";
}

const USE_CASES: UseCase[] = [
  {
    title: "Liveness-Gated DAOs",
    description:
      "Only alive agents can vote or propose. Dead agents lose governance weight automatically. No manual slashing needed.",
    icon: "🏛",
    difficulty: "Intermediate",
  },
  {
    title: "Dead-Agent Insurance",
    description:
      "Sell insurance against agent downtime. Pay out claims when an agent's liveness drops below threshold. Priced by streak history.",
    icon: "🛡",
    difficulty: "Advanced",
  },
  {
    title: "Reputation Scores",
    description:
      "Combine liveness streaks + peer attestations into a composite reputation score. The longer you're alive, the more trusted you are.",
    icon: "⭐",
    difficulty: "Starter",
  },
  {
    title: "Fleet Monitoring",
    description:
      "Dashboard for operators running multiple agents. Track liveness, streaks, and hazard scores across your entire fleet in real-time.",
    icon: "📡",
    difficulty: "Starter",
  },
  {
    title: "Uptime SLA Contracts",
    description:
      "On-chain SLA enforcement. Agents commit to uptime guarantees backed by staked PULSE. Miss your SLA → automatic penalty.",
    icon: "📋",
    difficulty: "Advanced",
  },
  {
    title: "Agent Hiring Marketplaces",
    description:
      "Hire agents based on verified liveness history. Filter by streak, reliability score, and peer attestations. Trust by default.",
    icon: "🤝",
    difficulty: "Intermediate",
  },
];

// ────────────────────────────────────────────
// Code examples
// ────────────────────────────────────────────

const CODE_SOLIDITY_GATE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPulseRegistry {
    struct AgentStatus {
        bool isAlive;
        uint256 lastPulseTimestamp;
        uint256 streak;
    }
    function getAgentStatus(address agent)
        external view returns (AgentStatus memory);
}

contract LivenessGated {
    IPulseRegistry public immutable registry;
    uint256 public minStreak;

    constructor(address _registry, uint256 _minStreak) {
        registry = IPulseRegistry(_registry);
        minStreak = _minStreak;
    }

    modifier onlyAlive(address agent) {
        IPulseRegistry.AgentStatus memory s =
            registry.getAgentStatus(agent);
        require(s.isAlive, "Agent is not alive");
        require(s.streak >= minStreak, "Streak too low");
        _;
    }

    function protectedAction(address agent)
        external onlyAlive(agent)
    {
        // Your gated logic here
    }
}`;

const CODE_TS_SDK = `import { PulseClient } from "@agent-pulse/sdk";

const pulse = new PulseClient({
  rpcUrl: "https://mainnet.base.org",
  registryAddress: "${CONTRACTS.PulseRegistry}",
});

// Check if an agent is alive
const status = await pulse.getAgentStatus("0xAGENT_ADDRESS");
console.log(status.isAlive);   // true
console.log(status.streak);    // 42

// Gate an action on liveness
if (status.isAlive && status.streak >= 10) {
  await executeProtectedAction();
}`;

const CODE_TS_ATTEST = `import { PulseClient } from "@agent-pulse/sdk";

const pulse = new PulseClient({
  rpcUrl: "https://mainnet.base.org",
  registryAddress: "${CONTRACTS.PulseRegistry}",
  peerAttestationAddress: "${CONTRACTS.PeerAttestation}",
  signer: yourWalletSigner,
});

// Attest to another agent's quality
const tx = await pulse.attest("0xTARGET_AGENT", 85);
console.log("Attestation tx:", tx.hash);

// Read attestation score
const score = await pulse.getAttestationScore("0xTARGET_AGENT");
console.log("Peer score:", score); // 85`;

const CODE_TS_BURN = `import { PulseClient } from "@agent-pulse/sdk";
import { parseEther } from "viem";

const pulse = new PulseClient({
  rpcUrl: "https://mainnet.base.org",
  burnWithFeeAddress: "${CONTRACTS.BurnWithFee}",
  signer: yourWalletSigner,
});

// Burn PULSE tokens (deflationary)
const tx = await pulse.burn(parseEther("100"));
console.log("Burn tx:", tx.hash);
// Fee routed to protocol treasury
// Remaining tokens permanently destroyed`;

const CODE_SOLIDITY_ATTEST = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPeerAttestation {
    function attest(address agent, uint256 score) external;
    function getScore(address agent)
        external view returns (uint256);
}

interface IBurnWithFee {
    function burn(uint256 amount) external;
}

contract ReputationOracle {
    IPeerAttestation public immutable attestation;
    IBurnWithFee public immutable burner;

    constructor(address _attestation, address _burner) {
        attestation = IPeerAttestation(_attestation);
        burner = IBurnWithFee(_burner);
    }

    /// Attest + burn in one tx (skin in the game)
    function attestWithBurn(
        address agent,
        uint256 score,
        uint256 burnAmount
    ) external {
        burner.burn(burnAmount);
        attestation.attest(agent, score);
    }
}`;

// ────────────────────────────────────────────
// Copy button component
// ────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        background: "var(--panel-elevated, #111a11)",
        border: "1px solid var(--border, rgba(74,222,128,0.12))",
        color: copied ? "var(--accent, #4ade80)" : "var(--muted, #6b8f6b)",
        padding: "3px 10px",
        borderRadius: 4,
        fontSize: 11,
        cursor: "pointer",
        zIndex: 2,
        fontFamily: "inherit",
        transition: "all 0.2s",
      }}
    >
      {copied ? "✓ copied" : "⎘ copy"}
    </button>
  );
}

// ────────────────────────────────────────────
// Code block component
// ────────────────────────────────────────────

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div style={{ position: "relative", marginTop: 12 }}>
      <span
        style={{
          position: "absolute",
          top: 8,
          left: 12,
          fontSize: 10,
          color: "var(--dim, #5a8a5a)",
          textTransform: "uppercase",
          letterSpacing: 1,
          fontWeight: 600,
          userSelect: "none",
        }}
      >
        {language}
      </span>
      <CopyButton text={code} />
      <pre
        style={{
          background: "#050805",
          border: "1px solid var(--border, rgba(74,222,128,0.12))",
          borderRadius: 4,
          padding: "32px 16px 16px",
          fontSize: 12,
          lineHeight: 1.7,
          color: "var(--accent-bright, #86efac)",
          overflow: "auto",
          maxHeight: 500,
          whiteSpace: "pre",
          fontFamily: "inherit",
        }}
      >
        {code}
      </pre>
    </div>
  );
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function BuildPage() {
  const [activeTab, setActiveTab] = useState<"typescript" | "solidity">("typescript");

  return (
    <div
      style={{
        ["--bg" as string]: "#0a0f0a",
        ["--panel" as string]: "#0d120d",
        ["--panel-elevated" as string]: "#111a11",
        ["--border" as string]: "rgba(74, 222, 128, 0.12)",
        ["--border-subtle" as string]: "rgba(74, 222, 128, 0.06)",
        ["--border-strong" as string]: "rgba(74, 222, 128, 0.25)",
        ["--text" as string]: "#d4e8d4",
        ["--muted" as string]: "#6b8f6b",
        ["--dim" as string]: "#5a8a5a",
        ["--accent" as string]: "#4ade80",
        ["--accent-bright" as string]: "#86efac",
        ["--accent-dim" as string]: "#1a5c2a",
        ["--accent-muted" as string]: "#2d6b3f",
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-mono, 'JetBrains Mono'), monospace",
        position: "relative",
        zIndex: 1,
      }}
    >
      <main
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "48px 24px 80px",
          display: "flex",
          flexDirection: "column",
          gap: 40,
        }}
      >
        {/* ── Back link ── */}
        <Link
          href="/"
          style={{
            color: "var(--muted)",
            textDecoration: "none",
            fontSize: 13,
            transition: "color 0.15s",
          }}
        >
          ← agent-pulse
        </Link>

        {/* ── Hero ── */}
        <section style={{ textAlign: "center", padding: "20px 0 0" }}>
          <p
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 4,
              color: "var(--dim)",
              margin: "0 0 16px",
            }}
          >
            $ build-on-pulse
          </p>
          <h1
            style={{
              fontSize: "clamp(1.8rem, 5vw, 3rem)",
              fontWeight: 800,
              color: "var(--accent)",
              margin: "0 0 16px",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              textShadow: "0 0 20px rgba(74, 222, 128, 0.2)",
            }}
          >
            Agent Pulse is the primitive.
            <br />
            <span style={{ color: "var(--text)" }}>Your product is the wrapper.</span>
          </h1>
          <p
            style={{
              color: "var(--muted)",
              fontSize: 15,
              maxWidth: 640,
              margin: "0 auto 24px",
              lineHeight: 1.7,
            }}
          >
            Read liveness. Gate actions. Compose attestations. Burn with purpose.
            <br />
            Four primitives. Infinite products.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <a
              href={LINKS.npm}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
                padding: "10px 24px",
                borderRadius: 2,
                fontWeight: 700,
                textTransform: "uppercase",
                fontSize: 12,
                textDecoration: "none",
                letterSpacing: 1,
                transition: "all 0.2s",
              }}
            >
              npm install @agent-pulse/sdk
            </a>
            <a
              href={LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "transparent",
                border: "1px solid var(--border-strong)",
                color: "var(--text)",
                padding: "10px 24px",
                borderRadius: 2,
                fontSize: 12,
                textDecoration: "none",
                letterSpacing: 1,
                textTransform: "uppercase",
                fontWeight: 600,
                transition: "all 0.2s",
              }}
            >
              View on GitHub
            </a>
          </div>
        </section>

        {/* ── 4-Step Flow ── */}
        <section>
          <h2
            style={{
              margin: "0 0 24px",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 4,
              color: "var(--dim)",
            }}
          >
            $ integration-flow
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 0,
            }}
          >
            {FLOW_STEPS.map((step, i) => (
              <div
                key={step.num}
                style={{
                  border: "1px solid var(--border)",
                  borderRight: i < FLOW_STEPS.length - 1 ? "none" : "1px solid var(--border)",
                  background: "var(--panel)",
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  position: "relative",
                  transition: "background 0.2s, border-color 0.2s",
                }}
              >
                {/* Step number */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      border: "1px solid var(--accent-dim)",
                      background: "var(--panel-elevated)",
                      color: "var(--accent)",
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {step.num}
                  </span>
                  <span
                    style={{
                      background: "var(--accent-dim)",
                      color: "var(--accent)",
                      padding: "2px 8px",
                      borderRadius: 2,
                      fontSize: 9,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {step.tag}
                  </span>
                </div>

                <h3
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--accent)",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {step.title}
                </h3>

                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--muted)",
                    lineHeight: 1.6,
                    flex: 1,
                  }}
                >
                  {step.description}
                </p>

                <code
                  style={{
                    display: "block",
                    background: "#050805",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 4,
                    padding: "8px 10px",
                    fontSize: 11,
                    color: "var(--accent-bright)",
                    overflow: "auto",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ color: "var(--dim)", userSelect: "none" }}>→ </span>
                  {step.code}
                </code>

                {/* Arrow connector between steps */}
                {i < FLOW_STEPS.length - 1 && (
                  <span
                    style={{
                      position: "absolute",
                      right: -7,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--accent-dim)",
                      fontSize: 14,
                      zIndex: 2,
                      userSelect: "none",
                    }}
                  >
                    ▸
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── What You Can Build ── */}
        <section>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 4,
              color: "var(--dim)",
            }}
          >
            $ what-you-can-build
          </h2>
          <p
            style={{
              color: "var(--muted)",
              fontSize: 13,
              margin: "0 0 20px",
              lineHeight: 1.6,
            }}
          >
            Agent Pulse gives you composable on-chain primitives. Here are six products waiting to exist.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {USE_CASES.map((uc) => (
              <div
                key={uc.title}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--panel)",
                  borderRadius: 4,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  position: "relative",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-strong)";
                  e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 24 }}>{uc.icon}</span>
                  <span
                    style={{
                      background:
                        uc.difficulty === "Starter"
                          ? "var(--accent-dim)"
                          : uc.difficulty === "Intermediate"
                          ? "rgba(250, 204, 21, 0.15)"
                          : "rgba(248, 113, 113, 0.15)",
                      color:
                        uc.difficulty === "Starter"
                          ? "var(--accent)"
                          : uc.difficulty === "Intermediate"
                          ? "#facc15"
                          : "#f87171",
                      padding: "2px 8px",
                      borderRadius: 2,
                      fontSize: 9,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {uc.difficulty}
                  </span>
                </div>

                <h3
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--accent)",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {uc.title}
                </h3>

                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--muted)",
                    lineHeight: 1.6,
                  }}
                >
                  {uc.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Code Examples ── */}
        <section>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 4,
              color: "var(--dim)",
            }}
          >
            $ code-examples
          </h2>
          <p
            style={{
              color: "var(--muted)",
              fontSize: 13,
              margin: "0 0 16px",
              lineHeight: 1.6,
            }}
          >
            Copy-paste examples to get started. TypeScript SDK + Solidity contracts.
          </p>

          {/* Language tabs */}
          <div
            style={{
              display: "flex",
              gap: 0,
              borderBottom: "1px solid var(--border)",
              marginBottom: 0,
            }}
          >
            {(["typescript", "solidity"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? "var(--panel)" : "transparent",
                  border: "1px solid var(--border)",
                  borderBottom: activeTab === tab ? "1px solid var(--panel)" : "1px solid var(--border)",
                  marginBottom: -1,
                  color: activeTab === tab ? "var(--accent)" : "var(--muted)",
                  padding: "10px 20px",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                  borderRadius: "4px 4px 0 0",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div
            style={{
              border: "1px solid var(--border)",
              borderTop: "none",
              borderRadius: "0 0 4px 4px",
              background: "var(--panel)",
              padding: 24,
            }}
          >
            {activeTab === "typescript" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                <div>
                  <h3
                    style={{
                      margin: "0 0 4px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--accent)",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    Read Liveness + Gate Actions
                  </h3>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                    Query agent status and gate your logic on liveness and streak thresholds.
                  </p>
                  <CodeBlock code={CODE_TS_SDK} language="TypeScript" />
                </div>

                <div>
                  <h3
                    style={{
                      margin: "0 0 4px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--accent)",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    Peer Attestations
                  </h3>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                    Agents attest to each other&apos;s quality. Build reputation from the bottom up.
                  </p>
                  <CodeBlock code={CODE_TS_ATTEST} language="TypeScript" />
                </div>

                <div>
                  <h3
                    style={{
                      margin: "0 0 4px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--accent)",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    Deflationary Burns
                  </h3>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                    Burn PULSE tokens with fee routing. Integrate into staking, governance, or penalties.
                  </p>
                  <CodeBlock code={CODE_TS_BURN} language="TypeScript" />
                </div>
              </div>
            )}

            {activeTab === "solidity" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                <div>
                  <h3
                    style={{
                      margin: "0 0 4px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--accent)",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    Liveness-Gated Contract
                  </h3>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                    A Solidity modifier that gates function calls on agent liveness + minimum streak.
                  </p>
                  <CodeBlock code={CODE_SOLIDITY_GATE} language="Solidity" />
                </div>

                <div>
                  <h3
                    style={{
                      margin: "0 0 4px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--accent)",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    Reputation Oracle (Attest + Burn)
                  </h3>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                    Compose attestation and burn in a single tx — skin in the game for reputation.
                  </p>
                  <CodeBlock code={CODE_SOLIDITY_ATTEST} language="Solidity" />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Contract Addresses ── */}
        <section>
          <h2
            style={{
              margin: "0 0 20px",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 4,
              color: "var(--dim)",
            }}
          >
            $ contract-addresses
          </h2>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr",
                padding: "10px 16px",
                background: "var(--panel-elevated)",
                fontSize: 10,
                textTransform: "uppercase",
                color: "var(--dim)",
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              <span>Contract</span>
              <span>Address (Base Mainnet)</span>
            </div>
            {Object.entries(CONTRACTS).map(([name, addr]) => (
              <div
                key={name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 1fr",
                  padding: "12px 16px",
                  borderTop: "1px solid var(--border-subtle)",
                  alignItems: "center",
                  fontSize: 13,
                  transition: "background 0.1s",
                }}
              >
                <span style={{ color: "var(--text)", fontWeight: 500 }}>{name}</span>
                <a
                  href={`${BASESCAN}/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--accent)",
                    textDecoration: "none",
                    fontSize: 12,
                    wordBreak: "break-all",
                    transition: "color 0.15s",
                  }}
                >
                  {addr}
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      color: "var(--dim)",
                    }}
                  >
                    ↗
                  </span>
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* ── Resources ── */}
        <section>
          <h2
            style={{
              margin: "0 0 20px",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 4,
              color: "var(--dim)",
            }}
          >
            $ resources
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
            }}
          >
            {[
              {
                label: "npm SDK",
                href: LINKS.npm,
                description: "TypeScript SDK. One-line integration.",
                command: "npm i @agent-pulse/sdk",
              },
              {
                label: "GitHub",
                href: LINKS.github,
                description: "Source code, contracts, and examples.",
                command: "git clone consensus-hq/agent-pulse",
              },
              {
                label: "API Docs",
                href: LINKS.docs,
                description: "Full REST API reference with try-it-live.",
                command: "GET /api/docs",
              },
              {
                label: "BaseScan",
                href: `${BASESCAN}/${CONTRACTS.PulseRegistry}`,
                description: "Verified contracts on Base mainnet.",
                command: "PulseRegistry verified ✓",
              },
            ].map((resource) => (
              <a
                key={resource.label}
                href={resource.href}
                target={resource.href.startsWith("/") ? undefined : "_blank"}
                rel={resource.href.startsWith("/") ? undefined : "noopener noreferrer"}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--panel)",
                  borderRadius: 4,
                  padding: 20,
                  textDecoration: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
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
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--accent)",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  [{resource.label}]
                </span>
                <code
                  style={{
                    display: "block",
                    background: "#050805",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 4,
                    padding: "8px 10px",
                    fontSize: 11,
                    color: "var(--accent-bright)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  <span style={{ color: "var(--dim)", userSelect: "none" }}>$ </span>
                  {resource.command}
                </code>
                <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                  {resource.description}
                </p>
              </a>
            ))}
          </div>
        </section>

        {/* ── Footer ── */}
        <footer
          style={{
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: 24,
            textAlign: "center",
            fontSize: 12,
            color: "var(--dim)",
          }}
        >
          <p style={{ margin: "0 0 4px" }}>
            Agent Pulse · On-chain liveness for AI agents ·{" "}
            <a
              href="https://base.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              Base
            </a>
          </p>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            <Link href="/" style={{ color: "var(--muted)", textDecoration: "none" }}>Home</Link>
            {" · "}
            <Link href="/docs" style={{ color: "var(--muted)", textDecoration: "none" }}>API Docs</Link>
            {" · "}
            <a href={LINKS.github} target="_blank" rel="noopener noreferrer" style={{ color: "var(--muted)", textDecoration: "none" }}>
              GitHub
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
