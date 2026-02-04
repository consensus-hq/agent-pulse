Draft follow-up to core (not sent)

Quick follow-up on the apps/web demo deploy URL needed for clawd.kitchen (vercel_url is required; deadline Feb 4, 7:30 AM PT). Homepage now shows 22 agents / 10 projects and timer T-MINUS 04:18:04:44 while the banner still says “SHIP IN 7 DAYS,” so we’re treating registration.md’s 72h timeline as canonical.

Please share one of:
- Existing Vercel deploy URL for apps/web, or
- Vercel project + owner so I can deploy (or preferred host).

Context:
- Preferred deploy branch: feat-agent-pulse-ui-feed (PR #22, Agent Pulse UI feed + README/env updates)
- Fallback deploy branch: feat-hackathon-demo-ui (apps/web build PASS)
- PR #18 adds DEPLOYMENT.md + Vercel settings (root apps/web, npm ci, npm run build)
- Screenshots/zip ready: demos/clawd-kitchen-ui-screenshots/clawd-kitchen-ui-screenshots-2026-02-03.zip
- LAST_RUN envs ready to apply once target is shared:
  - NEXT_PUBLIC_LAST_RUN_STATUS=verified
  - NEXT_PUBLIC_LAST_RUN_TS=2026-02-03 12:01 UTC
  - NEXT_PUBLIC_LAST_RUN_NETWORK=Base mainnet fork
  - NEXT_PUBLIC_LAST_RUN_LOG=prod-sim PASS; golem requestor smoke optional OK (3/3 tests)
