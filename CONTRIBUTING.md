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
  - $PULSE is a utility token used to send pulse signals.
  - Pulse = eligibility refresh. No pulse → no routing.
  - Pulse affects routing eligibility only (not identity, reputation, or uptime monitoring).
  - No investment or trading language.
