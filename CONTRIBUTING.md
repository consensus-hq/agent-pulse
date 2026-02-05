# Contributing to Agent Pulse

Thanks for your interest in contributing to Agent Pulse — an on-chain activity signal protocol for AI agents on Base.

## Development Setup

### Prerequisites
- **Node.js** 20+
- **Foundry** ([install guide](https://book.getfoundry.sh/getting-started/installation))
- **Git**

### Getting Started

```bash
# Clone the repo
git clone https://github.com/consensus-hq/agent-pulse.git
cd agent-pulse

# Install frontend dependencies
cd apps/web && npm install

# Install contract dependencies
cd ../../packages/contracts && forge install

# Copy env template
cp apps/web/.env.example apps/web/.env.local
```

### Running Locally

```bash
# Start the Next.js dev server
cd apps/web && npm run dev

# Run contract tests
cd packages/contracts && forge test

# Run tests with gas report
forge test --gas-report
```

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/your-feature main
   ```

2. **Make your changes** — keep commits focused and atomic.

3. **Run tests** before pushing:
   ```bash
   cd packages/contracts && forge test
   ```

4. **Run compliance check** on any user-facing text:
   ```bash
   node scripts/compliance-check.js
   ```

5. **Push and open a PR** against `main`:
   ```bash
   git push origin feat/your-feature
   gh pr create --base main
   ```

6. **Wait for CI** — CodeQL, Vercel preview, and auto-reviews (Codex/Devin) must pass.

## Code Style

### Solidity
- Follow [Solhint](https://protofire.github.io/solhint/) defaults
- Use NatSpec comments (`@notice`, `@param`, `@return`, `@dev`) on all public functions
- Follow CEI (Checks-Effects-Interactions) pattern
- Use `ReentrancyGuard` on state-changing external calls

### TypeScript / Next.js
- TypeScript strict mode
- Prefer `const` over `let`
- Use named exports

## Compliance Rules

Agent Pulse has strict compliance requirements:

- **$PULSE** is a **utility token** used to send pulse signals — never use investment/trading language
- Use **"signal sink"** — never "burn" when referring to the token destination
- **A pulse shows recent wallet activity** — it does not prove identity, quality, or "AI"
- Contract addresses appear only in `LINKS.md`, environment variables, and designated bio fields
- Run `scripts/compliance-check.js` before submitting any PR with user-facing text

## Testing

### Contract Tests
65 tests across 3 suites:
- **Unit tests** (40) — core registry functionality
- **Pentest v1** (13) — known attack vectors
- **Exploit v2** (12) — advanced attack simulations

### Running Tests
```bash
cd packages/contracts
forge test           # Run all tests
forge test -vvv      # Verbose output
forge test --match-test testPulse  # Run specific test
```

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](./LICENSE).
