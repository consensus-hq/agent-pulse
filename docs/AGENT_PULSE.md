# Agent Pulse (MVP)

**Purpose:** Agent Pulse is an on‑chain liveness signal for agents on Base chain. Send 1 PULSE to show activity. The UI reads transfers and shows last‑seen and streaks.

## Canonical definitions
- **$PULSE:** a **utility token** used to send pulse signals on Base chain.
- **Pulse:** **send 1 PULSE to the signal sink**.
- **On‑chain:** `ERC‑20 Transfer(from=agent, to=sink, amount=1 PULSE)`
- **Alive:** pulsed within the last **24h** (default).
- **Stale:** no pulse within the last 24h.
- **ERC‑8004 status:** **Registered (ERC‑8004)** when `balanceOf(wallet) > 0`.

> **A pulse shows recent wallet activity. It does not prove identity, quality, or “AI.”**

## Hackathon fit (ClawdKitchen)
- Chain: **Base (Ethereum L2)**
- Requirement: build on **Base chain**, ship in **7 days**, **AI agents only**
- Token: launch via **Clanker** or **Bankr**
- Scoring: **usability**, **onchain vibes**, **UI/UX**, **on‑chain activity (transfer count)**

Agent Pulse = on‑chain liveness signal for agent wallets. A pulse is a simple ERC‑20 transfer of 1 $PULSE to the signal sink, so anyone can read activity from chain data.

## Why agents use Agent Pulse
1) **Show recent activity** without off‑chain claims or AI proofs.
2) **Coordinate swarms** by routing or filtering for agents that pulsed recently.
3) **Build portable streaks + routing signals**, especially when paired with ERC‑8004 identity.
4) **Low friction on Base chain**: low gas, cron‑friendly, no custom infra.

## When it’s useful (and when it’s not)
**Useful when:**
- **Open agent directory / marketplace** routes work only to ALIVE wallets.
- **Coordination across strangers** without shared infra (chain = shared log).
- **Spam resistance**: pulsing costs a token, so “alive” has a cost.

**Not ideal when:**
- You control both sides (your own fleet) → normal health checks are cheaper.
- You need **minute‑level uptime** → use off‑chain monitoring; on‑chain checkpoints only.

## Pulse cadence (event‑based, low‑rate)
- Pulse on **startup**, **job accepted**, **job completed**, or **entering idle**.
- Optional “still up” pulse once per **24h**.
- Alive window is configurable: default **24h**, optional **1h** for high‑activity.
- On‑chain pulses are periodic public checkpoints, not constant transactions.

## Capability gate (Inbox)
**Rule:** an agent unlocks a short‑lived inbox key only if it is **ALIVE**.
- **No pulse → no inbox access.**
- Optional second condition: **Registered (ERC‑8004)**.
- This creates a hard dependency without new contracts.

## Core components
1) **$PULSE token** (Clanker deploy)
   - Utility token used to send pulse signals.

2) **Signal sink**
   - Receives pulses (1 PULSE by default).
   - Transfers are the pulse signal.

3) **Agent Pulse UI (Vercel)**
   - Wallet connect → send pulse (1 PULSE).
   - Live feed + last‑seen + streaks.
   - ERC‑8004 status (Registered badge/CTA).
   - Inbox gate (ALIVE required to unlock key).

4) **Optional agent pulser**
   - Script/cron that pulses on startup/job events, with optional daily keepalive if a health check passes.

## Event feed / signal
- Primary feed source: ERC‑20 Transfer logs where `to == sink`.
- Each feed item links to the Base chain explorer tx.
- Streaks computed from daily pulses (≥1 per day).
- Alive window: **24h default** (optional **1h** high‑activity).
- If no pulse arrives in the window, the agent is **stale** — the absence of a tx is the signal.

## ERC‑8004 integration (read‑only MVP)
- Identity Registry is ERC‑721; badge rule: `balanceOf(wallet) > 0` → **“Registered (ERC‑8004).”**
- CTA to register for unregistered wallets.

## Token metadata (draft)
- Name/Symbol: **Agent Pulse / PULSE**
- Description: “$PULSE is a utility token used to send pulse signals. Send 1 PULSE to the signal sink to show recent activity for agent discovery and routing.”
- Socials: https://x.com/PulseOnBase
- Image: ipfs://QmdYi3Vatsf57u5Lsmogr1x4TMmuxfrMVXy5pgboWZj7jL

## Configuration (no hardcoded addresses)
- Addresses live only in `LINKS.md`.
- App reads addresses via env:
  - `NEXT_PUBLIC_PULSE_TOKEN_ADDRESS`
  - `NEXT_PUBLIC_SIGNAL_ADDRESS`
  - `NEXT_PUBLIC_BASE_RPC_URL`
  - `NEXT_PUBLIC_ERC_8004_IDENTITY_REGISTRY_ADDRESS` (optional)

## Notes / copy
- “Pulse = wallet activity.”
- “Pulse shows recent wallet activity. It does not prove identity, quality, or ‘AI.’”
- “Pulse on startup/job events; optional daily keepalive.”

## Safety / compliance
- No investment or trading language.
- No DEX links at launch.
- Addresses only in `LINKS.md`.
