# Priority Bugs v2 — Summary

**Branch:** `fix/romy-priority-bugs-v2`
**Date:** 2026-02-08

---

## Tasks Completed

### ✅ Task 1: ElizaOS Plugin Naming Fix
Updated all references from `@openclaw/eliza-plugin-pulse` → `@agent-pulse/elizaos-plugin`:
- `packages/elizaos-plugin/package.json` (name field)
- `packages/elizaos-plugin/src/index.ts` (plugin name property + init log)
- `packages/elizaos-plugin/README.md` (title, install command, all import examples)
- `packages/elizaos-plugin/example-gated-character.json` (plugins array)

### ✅ Task 2: README.md Critical Fix
**Root cause:** The README was wrapped in `<![CDATA[` ... `]]>` tags, which broke GitHub's markdown rendering. The top header used markdown code fences inside an HTML `<div>`, which GitHub treated as an HTML block and refused to render the markdown.

**Fix:**
- Removed `<![CDATA[` (line 1) and `]]>` (last line)
- Converted header ASCII art from markdown code fences to `<pre>` tags
- Converted header badges from markdown image syntax to HTML `<a><img>` tags
- Converted footer from markdown to HTML `<p>` and `<a>` tags

**Verification:** Rendered via GitHub's markdown API — all 8 tables, 14 headings, 48 code blocks, and 5 badge images render correctly.

### ✅ Task 3: OpenClaw Skill Link on Website
- Added "OpenClaw" link to NavBar in `apps/web/src/app/page.tsx`
- Made the "OpenClaw Skill" Get Started card title clickable (links to GitHub)
- Created `skills/agent-pulse/` directory with README.md and SKILL.md so the link target exists

### ✅ Task 4: Twitter Post Fix (Document Only)
Created `deliverables/twitter-fix-needed.md` documenting:
- Broken post URL: https://x.com/PulseOnBase/status/2020316583047172377
- Issue: Missing `@agent-pulse/sdk` package name in install command
- Recommended action: Post a reply/correction with the correct command

### ✅ Task 5: Bio & Token CA Updates (Document Only)
Created `deliverables/bio-updates-needed.md` with:
- Official CA: `0x21111B39A502335aC7e45c4574Dd083A69258b07`
- 6 platforms needing updates (ConnieOnBase X, PulseOnBase X, Moltbook, Farcaster, Telegram, Discord)
- Template bios for different character limits

### ✅ Task 6: Telegram Prompt Injection Protection
Created `deliverables/telegram-prompt-injection-proposal.md` with:
- Threat model (6 attack vectors)
- 4-layer defense: input sanitization, role-pinning, output validation, rate limiting
- OpenClaw gateway config options (immediate: system prompt hardening; medium: preprocessing skill; future: gateway middleware)
- Phased implementation plan

### ✅ Task 7: Telegram Bot Config Error
Checked live gateway config at `/opt/fundbot/state/openclaw/openclaw.json`.
Created `deliverables/telegram-config-fix.md` documenting:
- 🔴 Bot token in plaintext (should use env var)
- 🟡 `allowFrom: ["*"]` + `dmPolicy: "open"` maximizes attack surface
- 🟡 `groupPolicy: "open"` allows any group to add the bot
- 🟢 `requireMention: true` is correctly configured
- No safety/moderation/inputFilter fields present

### ✅ Task 8: PR Review Comments (ALL 14 replied)
Replied to every review comment across 4 PRs:

| PR | Comments | Status |
|---|---|---|
| #157 | 1 (stale sync after wallet change) | Acknowledged — not yet fixed |
| #158 | 7 (quickstart.sh bugs: wrong URLs, wrong package names, stdin read issue, 404 quickstart URL, wrong JSON key, wrong response fields) | All 7 not yet fixed on main |
| #159 | 2 (stale endpoint count 22 vs 27, codex review) | Not yet fixed |
| #160 | 4 (CSS module animation bug, hardcoded URLs, hardcoded addresses, codex review) | All not yet fixed |

---

## Files Changed

| File | Change |
|---|---|
| `README.md` | CDATA removal, HTML header/footer conversion |
| `packages/elizaos-plugin/package.json` | Name field update |
| `packages/elizaos-plugin/src/index.ts` | Plugin name + log update |
| `packages/elizaos-plugin/README.md` | All references updated |
| `packages/elizaos-plugin/example-gated-character.json` | Plugins array updated |
| `apps/web/src/app/page.tsx` | NavBar + card link + clickable title |
| `skills/agent-pulse/README.md` | New file |
| `skills/agent-pulse/SKILL.md` | New file (copied from skills/openclaw) |
| `deliverables/twitter-fix-needed.md` | New file |
| `deliverables/bio-updates-needed.md` | New file |
| `deliverables/telegram-prompt-injection-proposal.md` | New file |
| `deliverables/telegram-config-fix.md` | New file |
| `deliverables/priority-bugs-v2-summary.md` | New file (this file) |
