---
name: pr-finalize
description: Pre-merge verification and PR finalization workflow. Use before merging ANY pull request — runs local build, TypeScript check, tests, checks Vercel preview status, reads auto-review comments (Devin/Codex), and validates diff size. Enforces a mandatory 7-gate checklist to prevent broken deploys, shipped bugs, and sloppy merges. Triggers on "merge PR", "finalize PR", "ready to merge", "check PR", or any merge decision point.
---

# PR Finalize

Mandatory pre-merge verification. Run this before every merge — no exceptions.

## Quick Start

```bash
# From repo root:
./skills/pr-finalize/scripts/pr-preflight.sh <PR_NUMBER>
```

The script runs 7 gates and exits non-zero if any fail. Do not merge on failure.

## Workflow

### 1. Run the preflight script
```bash
./skills/pr-finalize/scripts/pr-preflight.sh 113
```

### 2. If any gate fails — fix before merging
- Build fails → fix the code, push, re-run
- Reviews have red issues → address them, push, re-run
- Preview still building → wait, re-run

### 3. Only merge when all gates pass
```bash
gh pr merge <number> --squash
```

Use `--admin` only when build is READY, reviews are checked, AND there's real time pressure.

## Gates (7 total)

| # | Gate | What it catches |
|---|------|----------------|
| 1 | Branch safety | Merging from main directly |
| 2 | Local build | Turbopack/bundler errors that tsc misses |
| 3 | TypeScript | Type errors |
| 4 | Tests | Broken functionality |
| 5 | Vercel preview | Deploy failures before they hit production |
| 6 | Auto-reviews | Bugs found by Devin/Codex (red = block, P1 = review) |
| 7 | Diff size | Overly large PRs that should be split |

## Key Rules

- **Gate 2 is NOT optional.** `tsc --noEmit` misses bundler errors. `pnpm build` catches real failures.
- **Gate 6 requires patience.** Auto-reviews take 3-5 minutes. Wait for them.
- **Red (🔴) review comments are merge blockers.** Always fix before merge.
- **One concern per PR.** If you can describe two things, they're two PRs.

For detailed gate definitions and common mistakes, see [references/checklist.md](references/checklist.md).
