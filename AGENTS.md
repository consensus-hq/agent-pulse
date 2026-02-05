# Repository Guidelines

## Project Structure & Module Organization
- **Frontend**: `apps/web/` (Next.js App Router). Source in `apps/web/src/`, API routes in `apps/web/src/app/api/`.
- **Contracts**: `packages/contracts/` (Foundry). Solidity in `packages/contracts/contracts/`, tests in `packages/contracts/test/`.
- **Scripts**: root `scripts/` (deploy, fork sims, QA helpers).
- **Docs/Reports**: `docs/` for specs and guides, `REPORTS/` for audit/test artifacts.
- **Addresses**: `LINKS.md` is the single source of truth for on-chain addresses.

## Build, Test, and Development Commands
Frontend (run from `apps/web`):
- `npm run dev` – local dev server
- `npm run build` – production build
- `npm run lint` – ESLint
- `npm run env:check` – validate env schema

Contracts (run from `packages/contracts`):
- `forge install` – fetch deps
- `forge build` – compile
- `forge test` – test suite (`forge test --match-test testPulse` for a single test)

Repo-wide:
- `node scripts/compliance-check.js` – required for user-facing copy

## Coding Style & Naming Conventions
- **TypeScript**: strict mode, prefer `const`, named exports.
- **Solidity**: NatSpec on public/external functions; follow CEI; use `ReentrancyGuard` for external calls.

## Testing Guidelines
- Contracts use Foundry. Keep tests deterministic (explicit time warps, no real RPCs).
- Frontend relies on lint/build + smoke checks; keep API routes deterministic and cache-aware.

## Commit & Pull Request Guidelines
- Branch naming: `feat/<slug>` or `fix/<slug>`.
- Commits: small, focused (prefer conventional prefixes: `feat:`, `fix:`, `docs:` when possible).
- PRs must include: purpose, tests run, and screenshots for UI changes. Run compliance check before merge.

## Security & Configuration Tips
- **No secrets** in git. Use `apps/web/.env.local` for local values.
- **No addresses** in code or docs—only in `LINKS.md` and env vars.
- **Compliance**: use “signal sink,” avoid investment/trading language.
