# Contributing

Thanks for helping improve Agent Pulse.

## Basics
- Use feature branches (no direct commits to `main`).
- Keep changes focused and well-documented.
- Include tests or a brief validation note in your PR description.

## Development
```bash
cd apps/web
npm install
npm run dev
```

## Pull Requests
- Summarize changes and include screenshots for UI updates.
- Ensure copy follows the pulse language rules:
  - **Paid eligibility**: pulsing adds a small on‑chain cost to remain routable.
  - **Pulse = eligibility refresh** (1 PULSE to the **burn sink**; pulses are consumed).
  - **No pulse → no routing** (binary eligibility).
  - **ERC‑8004 read‑only by default**; gate is optional via `REQUIRE_ERC8004`.
  - **No investment or trading language.**
  - $PULSE is a utility token used to send pulse signals.
  - A pulse shows recent wallet activity. It does not prove identity, quality, or “AI.”
