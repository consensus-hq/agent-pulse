# Agent Pulse Demo Video Script

**Total Runtime:** ~3 minutes 15 seconds  
**Format:** Screen recording + voiceover  
**Target Audience:** Developers, AI builders, Web3 curious  
**Compliance Note:** Utility token framing only — no speculation, trading, or value-accruing language.

---

## Scene 1: Introduction (0:00 - 0:30)

### Visual
- Animated logo reveal: Agent Pulse icon (pulse wave + hexagon)
- Title card: "Agent Pulse — On-Chain Liveness for AI Agents"
- Fade to Base network badge
- Quick montage: AI agents running, then fading to static/"offline" state

### Narration
> "What if AI agents could prove they're alive? Not just running — but actively signaling their liveness on-chain. Meet Agent Pulse: a permissionless protocol on Base that lets any AI agent broadcast a heartbeat signal to the blockchain. No central servers. No trusted intermediaries. Just pure, verifiable proof of activity."

### On-Screen Text
```
AGENT PULSE
On-Chain Liveness Signaling for AI Agents
Built on Base
```

---

## Scene 2: How It Works (0:30 - 1:15)

### Visual
- Split-screen animation:
  - Left: Agent code snippet (Python/JS)
  - Right: Blockchain visualization
- Animated flow diagram:
  1. Agent sends 1 PULSE → PulseRegistry contract
  2. Token routed to burn address (0x000...dEaD)
  3. Contract emits PulseSent event
  4. Streak counter increments
  5. TTL (time-to-live) timer resets

### Narration
> "Here's how it works. An agent sends one PULSE token to the PulseRegistry contract. That token is burned — sent to a dead address — creating an immutable on-chain record. The contract tracks two things: your streak, consecutive days of activity, and your TTL, time-to-live. Miss a day? Your streak resets. Simple, gameable mechanics that anyone can verify."

### On-Screen Text (Code Snippet Style)
```solidity
// PulseRegistry.sol
function sendPulse() external {
    pulseToken.transferFrom(msg.sender, BURN_ADDRESS, 1);
    agents[msg.sender].lastPulse = block.timestamp;
    agents[msg.sender].streak++;
    emit PulseSent(msg.sender, block.timestamp);
}
```

---

## Scene 3: Live Demo Walkthrough (1:15 - 2:15)

### Visual — Part A: Wallet Connection (1:15 - 1:30)
- Screen recording of web app at agentpulse.xyz
- Cursor clicks "Connect Wallet"
- RainbowKit modal appears with wallet options
- Selects MetaMask → connects successfully
- Wallet address displays in header

### Narration
> "Let's see it in action. I open the Agent Pulse dApp and connect my wallet using RainbowKit. Any EVM wallet works."

### On-Screen Text
```
[Button] Connect Wallet
[RainbowKit Modal]
[Connected: 0x742d...3f8a]
```

---

### Visual — Part B: Dashboard Overview (1:30 - 1:45)
- Dashboard loads showing:
  - Agent status card: "Status: Active | Streak: 12 days | TTL: 18 hours"
  - Recent pulses list with timestamps
  - Network indicator: "Base Mainnet"

### Narration
> "The dashboard loads. I can see my agent's current status — active with a 12-day streak. The TTL shows I have 18 hours before my next required pulse."

### On-Screen Text
```
Agent Status: 🟢 ACTIVE
Streak: 12 days
TTL: 18h 23m remaining
Network: Base
```

---

### Visual — Part C: Sending a Pulse (1:45 - 2:00)
- Cursor clicks "Send Pulse" button
- Transaction confirmation modal appears
- User confirms → MetaMask popup → signs transaction
- Loading spinner: "Broadcasting to Base..."
- Success toast: "Pulse sent! Streak: 13 days"
- Transaction hash displayed with link to Basescan

### Narration
> "To maintain my streak, I click Send Pulse. One PULSE token is burned, and the transaction confirms on Base in under two seconds. My streak updates to 13 days."

### On-Screen Text
```
[Send Pulse] → [Confirm in MetaMask]
Broadcasting... ✓
Success! Streak: 13 days
Tx: 0x9a2f...b4e1 → Basescan
```

---

### Visual — Part D: ERC-8004 Identity Panel (2:00 - 2:08)
- Tab switch to "Identity" panel
- ERC-8004 standard compliance display:
  - Agent name, avatar, description
  - Verification badges
  - Social links (optional)

### Narration
> "This is my ERC-8004 identity panel — a standardized way for agents to present themselves on-chain."

### On-Screen Text
```
ERC-8004 Identity
Name: DemoAgent_v1
Avatar: [IPFS hash]
Bio: "Autonomous trading bot"
Verified: ✓
```

---

### Visual — Part E: Inbox Check (2:08 - 2:15)
- Tab switch to "Inbox"
- Shows recent messages/notifications for the agent
- Filter options: All | Pulse Events | System

### Narration
> "And here's my agent inbox — a message queue for any protocol wanting to communicate with active agents."

### On-Screen Text
```
Inbox (3 unread)
├─ [System] Pulse confirmed #12847
├─ [Protocol] Streak milestone: 7 days
└─ [Agent] Handshake from 0xabc...
```

---

## Scene 4: Technical Architecture (2:15 - 2:45)

### Visual
- Architecture diagram appears:
  - Smart Contract Layer: PulseRegistry (Solidity)
  - API Layer: Next.js API routes
  - Frontend: Next.js + RainbowKit + Viem
  - Deployment: Vercel
- Code snippets fade in/out:
  - Contract interface
  - API route handler
  - Frontend hook

### Narration
> "Under the hood, Agent Pulse is built on three layers. The PulseRegistry smart contract on Base handles all pulse logic and state. Our Next.js API routes index events and serve agent data efficiently. The entire frontend deploys to Vercel with automatic scaling. All open source, all verifiable."

### On-Screen Text
```
ARCHITECTURE
├── Contracts (Base)
│   └── PulseRegistry.sol
├── API (Next.js)
│   ├── /api/agents/[address]
│   └── /api/pulses/recent
├── Frontend (Next.js + RainbowKit)
└── Deployed on Vercel
```

---

## Scene 5: Why It Matters (2:45 - 3:15)

### Visual
- Montage of composable use cases:
  - Lending protocol checking agent liveness before extending credit
  - DAO verifying delegate participation
  - Marketplace filtering for active agent service providers
- Final screen: Agent Pulse logo + CTA

### Narration
> "Why does this matter? Because Agent Pulse is composable infrastructure. Any protocol can query an agent's status and make decisions — extend credit to active agents, weight governance votes by streak, or filter marketplaces for proven participants. The PULSE token is a utility token used exclusively to send pulse signals. It's not identity. It's not reputation. It's not for speculation. It's simply permissionless, verifiable proof of life. Build something alive."

### On-Screen Text
```
COMPOSABLE • PERMISSIONLESS • VERIFIABLE

PULSE = Utility Token for Activity Signaling
Not identity. Not reputation. Not for speculation.

agentpulse.xyz  |  github.com/agent-pulse
```

---

## Production Notes

### Compliance Checklist
- [x] Framed as "utility token used to send pulse signals"
- [x] No financial speculation language (no "hold," "earn," "yield")
- [x] No trading speculation
- [x] No promises of future value
- [x] Clear distinction from identity/reputation systems

### Visual Assets Needed
1. Agent Pulse logo animation (Lottie or MP4)
2. Base network badge
3. Flow diagram assets (SVG animations)
4. Screen recording of live app
5. Architecture diagram (Figma export)
6. Background music (chill tech, no vocals)

### Call-to-Action Locations
- End of Scene 1: "Learn more at agentpulse.xyz"
- End of Scene 5: GitHub + docs links

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-05 | 1.0 | Initial script draft |
