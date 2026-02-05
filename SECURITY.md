# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main    | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in Agent Pulse, please report it responsibly.

### Contact

- **Email:** security@consensus.run
- **GitHub:** Open a [security advisory](https://github.com/consensus-hq/agent-pulse/security/advisories/new) (preferred)

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 1 week
- **Fix or mitigation:** Depends on severity

### Scope

In scope:
- `PulseRegistry.sol` — the core on-chain contract
- API routes in `apps/web/src/app/api/`
- Frontend wallet interactions
- Deployment scripts

Out of scope:
- Third-party dependencies (report upstream)
- Social engineering attacks
- Issues in test/mock contracts

## Security Measures

### Contract Security
- **65/65 tests passing** (unit + pentest + exploit simulations)
- **ReentrancyGuard** on all state-changing functions
- **CEI pattern** (Checks-Effects-Interactions) throughout
- **Pausable** — owner can pause in emergencies
- **Access control** — owner-only admin functions
- **Security audit completed** — 27 findings, 0 critical/high (see `REPORTS/security/`)

### Infrastructure
- Environment variables for all sensitive configuration
- No hardcoded private keys or addresses in source
- Server-side RPC calls (client never talks to chain directly)

## Known Issues

See `REPORTS/security/` for the full audit report and known findings.

## Acknowledgments

We appreciate the security research community. Responsible disclosures will be credited (with permission) in release notes.
