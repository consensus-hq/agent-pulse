# Changelog

All notable changes to `@agent-pulse/sdk` will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

---

## [0.2.0] — 2026-02-07

### Added
- Comprehensive README with full API reference, quick-start guide, and x402 flow documentation
- JSDoc comments on all exported functions and types
- CHANGELOG.md
- `examples/` directory with three runnable TypeScript scripts:
  - `basic-alive-check.ts` — single-agent liveness check
  - `batch-check-agents.ts` — parallel multi-agent checks
  - `monitor-agent-uptime.ts` — continuous monitoring loop
- Package metadata: keywords, repository, bugs, homepage, author, sideEffects

### Fixed
- **Build:** resolved DTS generation failure caused by `AgentPulseClientConfig` import from wrong module
- **Build:** fixed `package.json` exports map — `"types"` condition now precedes `"import"`/`"require"` per Node.js resolution spec
- **Types:** fixed strict-mode TS errors in `gate.ts` (definite assignment), `x402.ts` (nullable strings), `attestation.ts` (unused parameter)
- **Chains:** SDK now dynamically selects Base mainnet or Base Sepolia based on `chainId` config instead of hard-coding `baseSepolia`
- **Imports:** fixed `attestation.ts` importing `baseSepolia` from `"viem"` root (not exported) — corrected to `"viem/chains"`

### Changed
- Bumped version to 0.2.0
- Default chain selection now uses Base mainnet (8453) when `chainId` is not explicitly set to 84532

---

## [0.1.0] — 2026-02-06

### Added
- Initial SDK release
- `AgentPulse` main class with One-Line Pulse™ (`pulse.beat()`)
- `AgentPulseClient` for full protocol interaction
- `AgentPulseGate` for bidirectional liveness gating (strict / warn / log modes)
- `AttestationModule` for peer-to-peer attestation and reputation
- `X402PaymentHandler` and signing utilities for x402 micropayments
- On-chain reads: `isAlive()`, `getAgentStatus()`, `getBalance()`
- Paid API calls: reliability, liveness proof, global stats, peer correlation
- Free API calls: protocol config, protocol health
- Type exports for all request/response shapes
- Constants: `DEFAULTS`, `ENDPOINT_PRICES`, `USDC_ADDRESSES`, `DEAD_ADDRESS`
- ESM + CJS dual-format build via tsup
- Vitest test suite
