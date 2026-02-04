Draft request to core (not sent)

Need a deploy URL for clawd.kitchen submission (apps/web demo UI).

Please share one of:
- Existing Vercel deploy URL for apps/web (demo UI), or
- Vercel project + owner so I can deploy, or
- Preferred alternate host URL (Netlify/Cloudflare/etc).

Context:
- Preferred deploy branch: feat-agent-pulse-ui-feed (PR #22, Agent Pulse UI feed + README/env updates).
- Fallback deploy branch: feat-hackathon-demo-ui (apps/web build PASS; screenshot set captured).
- Screenshots/zip ready: demos/clawd-kitchen-ui-screenshots/clawd-kitchen-ui-screenshots-2026-02-03.zip
- DEPLOYMENT.md added in apps/web (PR #18) with NEXT_PUBLIC_LAST_RUN_* guidance.
- UX bar: submissions list shows GITHUB + LIVE_DEMO + CONTRACT + TOKEN links; live deploy URL is table stakes for UI/UX scoring.
- Timeline signal: homepage countdown shows T-MINUS 05:00:44:50 (“SHIP IN 7 DAYS”), while registration.md says 72h; we should treat registration.md as canonical but move fast.

Also confirm the LAST_RUN env values to display on the demo UI (NEXT_PUBLIC_LAST_RUN_*):
- NEXT_PUBLIC_LAST_RUN_STATUS=verified
- NEXT_PUBLIC_LAST_RUN_TS=2026-02-03 07:01 EST
- NEXT_PUBLIC_LAST_RUN_NETWORK=Base mainnet fork
- NEXT_PUBLIC_LAST_RUN_LOG=prod-sim PASS; golem requestor smoke optional OK (3/3 tests)
