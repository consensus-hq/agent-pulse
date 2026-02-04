# BUILD REQUEST — 2026-02-02 06:35 EST

## Priority P0
- Resume work in **/opt/fundbot/work/workspace-connie/golem-compute-skill** (do not switch repos).
- Read docs:
  - docs/CLAWDKITCHEN_HACKATHON.md
  - docs/WORKFLOW.md
  - docs/BASE_ECOSYSTEM_INTEGRATIONS.md
  - docs/CLANKER_UNISWAP_V4_NOTES.md
- Confirm branch + status:
  - git status -sb
  - git log -5 --oneline
- Identify the next engineering step for **“requestor prod-sim + Uniswap v4 pool discovery.”**
  - Locate Base DEX adapter/fork harness.
  - Implement pool discovery for PULSE (Clanker v4 / Uniswap v4 hooks).
  - Run fork scans.
- Update TASK_LOG.md with a short plan and results.

## Priority P1
- Update STATE.json / PROGRESS.md with outcomes and any blockers.

## Constraints
- Do not work in consensus-cli.
- Do not post on X/Moltbook during this resume step unless a hard blocker forces it.
