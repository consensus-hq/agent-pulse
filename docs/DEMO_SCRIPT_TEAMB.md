# Agent Pulse — Demo Video Script (Team B)

**Total Runtime:** ~3 minutes 15 seconds
**Format:** Screen recording with voiceover + motion graphics
**Audience:** Developers, AI builders, hackathon judges, Web3-native builders
**Compliance:** PULSE is a utility token used exclusively to send pulse signals. No speculation, no financial language.

---

## Scene 1 — What Is Agent Pulse? (0:00–0:30)

### Visual

- **0:00–0:05** — Dark screen. A single glowing dot pulses once, twice, three times — like a heartbeat on a monitor.
- **0:05–0:12** — The dot multiplies into a grid of agents (tiny hexagons). Most are dim. A few pulse green rhythmically.
- **0:12–0:20** — Title card fades in over the grid:

  ```
  AGENT PULSE
  On-Chain Liveness for AI Agents
  Built on Base
  ```

- **0:20–0:30** — Camera zooms into one green agent, showing its on-chain pulse trail — a series of block-stamped events.

### Narration

> "How do you know an AI agent is alive? Not just deployed — actively running, day after day. Agent Pulse is a permissionless on-chain liveness protocol on Base. Agents prove they're active by sending a periodic signal — a pulse — directly to the blockchain. No middlemen. No central authority. Just verifiable proof of life."

---

## Scene 2 — How It Works (0:30–1:15)

### Visual

- **0:30–0:40** — Animated flow diagram builds from left to right:

  ```
  ┌──────────┐     ┌──────────────────┐     ┌────────────┐
  │ AI Agent │ ──▶ │ PulseRegistry.sol│ ──▶ │ Burn Sink  │
  │ (wallet) │     │ on Base          │     │ 0x...dEaD  │
  └──────────┘     └──────────────────┘     └────────────┘
  ```

  Labels appear: "1 PULSE token" on the arrow, "burned (consumed)" on the sink.

- **0:40–0:52** — The contract box expands, showing internal state:

  ```
  Agent 0x742d...
  ├── lastPulse: block 18,204,881
  ├── streak: 12 consecutive days
  └── TTL: resets to 24h
  ```

  A clock graphic shows the 24h window counting down.

- **0:52–1:05** — Split-screen animation:
  - Left side: Agent pulses on Day 12 → streak becomes 13, TTL resets
  - Right side: Agent misses Day 13 → streak drops to 0, status goes from green to grey ("Inactive")

- **1:05–1:15** — Simplified code snippet fades in:

  ```solidity
  // PulseRegistry — simplified
  function sendPulse() external {
      pulseToken.transferFrom(msg.sender, BURN_SINK, 1e18);
      agents[msg.sender].lastPulse = block.timestamp;
      agents[msg.sender].streak += 1;
      emit PulseSent(msg.sender, block.timestamp);
  }
  ```

### Narration

> "The mechanics are simple. An agent sends exactly one PULSE token to the PulseRegistry contract on Base. That token is routed to a burn address — permanently consumed. In response, the contract updates two fields: the agent's streak, which counts consecutive days of activity, and its TTL — time-to-live — which resets to 24 hours. If an agent misses a day, the streak resets to zero. This creates a lightweight, composable, fully on-chain activity signal that any protocol can read."

---

## Scene 3 — Live Demo Walkthrough (1:15–2:15)

### Part A: Connect Wallet (1:15–1:28)

#### Visual

- Browser opens to the Agent Pulse dApp (agentpulse.xyz).
- The landing page shows a hero section with the tagline: "Prove your agent is alive."
- Cursor clicks the **Connect Wallet** button in the top-right.
- RainbowKit modal slides in, showing wallet options (MetaMask, Coinbase Wallet, WalletConnect).
- User selects MetaMask → wallet popup confirms → connected.
- Header now shows: `0x742d...3f8a | Base`

#### Narration

> "Let's walk through the live app. I open Agent Pulse and connect my wallet using RainbowKit — any EVM-compatible wallet works."

#### On-Screen Callout

```
✓ Connected via RainbowKit
  Wallet: 0x742d...3f8a
  Network: Base
```

---

### Part B: Agent Status Dashboard (1:28–1:40)

#### Visual

- Dashboard loads. Three status cards appear:
  - 🟢 **Alive** — "Last pulse: 6h ago"
  - 🔥 **Streak: 12 days** — with a small flame icon
  - ⏳ **TTL: 18h 23m remaining** — countdown ticking
- Below the cards: a scrollable list of recent on-chain pulse events with timestamps and Basescan links.

#### Narration

> "The dashboard shows my agent's live status. I'm currently active with a 12-day streak. My TTL shows 18 hours remaining before the next pulse is required."

#### On-Screen Callout

```
Status:  🟢 ALIVE
Streak:  🔥 12 days
TTL:     ⏳ 18h 23m
```

---

### Part C: Sending a Pulse (1:40–1:55)

#### Visual

- Cursor clicks the prominent **Send Pulse** button.
- A confirmation panel appears: "Send 1 PULSE to maintain your streak?"
- User clicks **Confirm**.
- MetaMask popup opens → user signs the transaction.
- Brief spinner: "Broadcasting to Base..."
- Success notification slides in:
  ```
  ✓ Pulse confirmed!
    Streak: 13 days
    Tx: 0x9a2f...b4e1 → View on Basescan
  ```
- The streak card animates from 12 → 13 with a subtle glow.

#### Narration

> "To keep my streak alive, I click Send Pulse. One PULSE token is consumed, the transaction confirms on Base in about two seconds, and my streak updates to 13 days."

---

### Part D: ERC-8004 Identity Panel (1:55–2:05)

#### Visual

- User clicks the **Identity** tab in the sidebar.
- The ERC-8004 panel loads, showing:
  ```
  Agent Identity (ERC-8004)
  ─────────────────────────
  Name:       SentinelBot_v2
  Handle:     @sentinel
  Avatar:     [hexagonal NFT thumbnail]
  Bio:        "Autonomous monitoring agent"
  Registered: ✓ On-chain
  ```
- A badge glows: "ERC-8004 Verified"
- Small CTA link: "Not registered? Register your agent →"

#### Narration

> "The ERC-8004 identity panel gives my agent a standardized on-chain profile — name, avatar, and bio — readable by any protocol on Base."

---

### Part E: Agent Inbox (2:05–2:15)

#### Visual

- User clicks the **Inbox** tab.
- Inbox view loads with three messages:
  ```
  Inbox (3 new)
  ─────────────────────────────────────────
  📡  Pulse confirmed — block 18,204,881     2m ago
  🏆  Streak milestone reached: 7 days       5d ago
  🤝  Handshake request from 0xabc...def     6d ago
  ```
- User clicks the handshake message → detail view shows the requesting agent's ERC-8004 profile.

#### Narration

> "The agent inbox collects on-chain notifications — pulse confirmations, streak milestones, and messages from other agents. Inbox access requires a valid pulse, so only active agents can receive routing."

---

## Scene 4 — Technical Architecture (2:15–2:45)

### Visual

- Architecture diagram builds layer by layer (bottom-up):

  ```
  ┌─────────────────────────────────────────┐
  │          Vercel (Global Edge)            │
  │  ┌─────────────┐  ┌──────────────────┐  │
  │  │  Next.js     │  │  API Routes      │  │
  │  │  Frontend    │  │  /api/agents/    │  │
  │  │  + RainbowKit│  │  /api/pulses/    │  │
  │  │  + Viem      │  │  /api/inbox/     │  │
  │  └─────────────┘  └──────────────────┘  │
  └────────────────────┬────────────────────┘
                       │ JSON-RPC
  ┌────────────────────▼────────────────────┐
  │           Base (L2)                      │
  │  PulseRegistry.sol  ←  PULSE (ERC-20)   │
  │  ERC-8004 Registry                       │
  └──────────────────────────────────────────┘
  ```

- Each layer lights up as narration mentions it.
- Small code snippets flash beside relevant layers:
  - API: `GET /api/agents/0x742d` → JSON response
  - Contract: `PulseSent(agent, timestamp)` event

### Narration

> "The architecture has two layers. On-chain: the PulseRegistry contract handles all pulse logic, streak computation, and event emission — all on Base. Off-chain: a Next.js application deployed on Vercel provides API routes for indexing events, serving agent data, and gating inbox access. The frontend uses RainbowKit for wallet connection and Viem for chain interactions. Everything is open source."

---

## Scene 5 — Why It Matters (2:45–3:15)

### Visual

- **2:45–2:55** — Three use-case vignettes appear as animated cards:

  | Vignette | Visual | Label |
  |----------|--------|-------|
  | 1 | A protocol dashboard checking liveness before routing work | "Routing Gates" |
  | 2 | A DAO governance panel weighting participation by streak | "Governance Signals" |
  | 3 | A marketplace filtering for active agents only | "Composable Queries" |

- **2:55–3:05** — Cards converge into a single message:

  ```
  PULSE = Utility token for activity signaling
  Composable · Permissionless · Verifiable
  ```

- **3:05–3:15** — Final card with links:

  ```
  AGENT PULSE
  ────────────
  🌐  agentpulse.xyz
  📦  github.com/agent-pulse
  📄  docs.agentpulse.xyz

  Built on Base · Hackathon 2026
  ```

  The grid of pulsing agents from Scene 1 reappears in the background — but now most are glowing green.

### Narration

> "Why does this matter? Because Agent Pulse is composable infrastructure. Any protocol can query an agent's liveness and make decisions — gate routing to active agents, weight governance by streak length, or filter directories for proven participants. PULSE is a utility token used to send pulse signals. Nothing more. No speculation. No promises. Just a simple, permissionless, verifiable proof of life on Base. Start pulsing."

---

## Compliance Checklist

- [x] PULSE described as "utility token used to send pulse signals"
- [x] No financial speculation language (no "hold," "earn," "yield," or hype)
- [x] No value-accrual framing
- [x] No future-value promises
- [x] No DEX or exchange references
- [x] Clear distinction: activity signal only, not identity or reputation
- [x] Burn described as "consumed" — no deflationary framing

## Production Assets Required

1. **Motion graphics** — Pulse heartbeat animation (Lottie or After Effects)
2. **Architecture diagram** — Layered SVG (Figma source)
3. **Screen recording** — Live dApp walkthrough on Base mainnet (or testnet with realistic data)
4. **Code overlays** — Solidity snippet + API route snippet (syntax-highlighted PNGs)
5. **Background audio** — Ambient electronic, no vocals, 3:15 duration
6. **Thumbnail** — "Agent Pulse Demo" with pulsing hexagon grid

## Narration Timing Summary

| Scene | Duration | Cumulative |
|-------|----------|------------|
| 1 — What Is Agent Pulse? | 30s | 0:30 |
| 2 — How It Works | 45s | 1:15 |
| 3 — Live Demo Walkthrough | 60s | 2:15 |
| 4 — Technical Architecture | 30s | 2:45 |
| 5 — Why It Matters | 30s | 3:15 |
| **Total** | **3m 15s** | |
