# PR Finalize Checklist Reference

## Gate Definitions

### Gate 1 — Branch Safety
Never merge from main. PRs must originate from feature branches.

### Gate 2 — Local Build
Run the **actual** bundler/compiler, not just the type checker.
- `tsc --noEmit` misses Turbopack, Webpack, Vite, esbuild errors
- `pnpm build` / `forge build` catches real import resolution failures
- A PR that passes tsc but fails the build WILL break production

### Gate 3 — TypeScript
Zero errors from `tsc --noEmit`. Redundant with Gate 2 but fast and catches different issues.

### Gate 4 — Tests
All test suites must pass. New code should have coverage.

### Gate 5 — Vercel/CI Preview
Wait for the preview deployment to reach READY/SUCCESS state.
- If ERROR: read the build logs, fix, push again
- If BUILDING: wait — do not merge while building
- Preview deploys are on PR branches, not main

### Gate 6 — Auto-Reviews
Devin and Codex auto-review every PR in 3-5 minutes.
- 🔴 Red issues: MUST fix before merge. No exceptions.
- P1 Orange issues: READ and decide. Fix if legitimate, note if not applicable.
- P2 Yellow issues: Nice-to-have. Fix if quick, skip if not.
- No comments yet: WAIT. Reviews take 3-5 min. Don't merge before they arrive.

### Gate 7 — Diff Sanity
Large PRs (50+ files) should be split. Each PR should address one concern.

## When to Use `--admin` Merge
Only when ALL three conditions are met:
1. Build is verified READY (Gate 2 + Gate 5 passed)
2. Auto-reviews are checked (Gate 6 — at least read)
3. There's genuine time pressure (not just convenience)

## Common Mistakes
- Running `tsc` instead of `pnpm build` → misses bundler errors
- Merging before Devin reviews → ships bugs to production
- Using `--admin` as default → bypasses all safety gates
- Not reading subagent diffs → broken imports, wrong paths
- Multiple commits for one fix → "burn" → "stake" → "send"
