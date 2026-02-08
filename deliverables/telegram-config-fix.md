# Telegram Bot Config Analysis

**Date:** 2026-02-08
**Config path:** `/opt/fundbot/state/openclaw/openclaw.json` → `channels.telegram`

---

## Current Config

```json
{
  "enabled": true,
  "dmPolicy": "open",
  "botToken": "<REDACTED>",

  "groups": {
    "*": {
      "requireMention": true
    }
  },
  "allowFrom": ["*"],
  "groupPolicy": "open",
  "streamMode": "partial"
}
```

---

## Issues Found

### 🔴 CRITICAL: Bot Token Exposed in Config

The `botToken` field contains a live Telegram bot token in plaintext. While the config file is local, it should be referenced via environment variable to prevent accidental commits or leaks.

**Recommendation:** Move token to env var:
```json
{
  "botToken": "${TELEGRAM_BOT_TOKEN}"
}
```

### 🟡 WARN: `allowFrom: ["*"]` — Open to All Users

The bot accepts messages from **any** Telegram user. Combined with `dmPolicy: "open"`, this means anyone can DM the bot. This maximizes the prompt injection attack surface.

**Recommendation:** Consider restricting `allowFrom` to known user IDs or group IDs during beta, or add rate limiting.

### 🟡 WARN: `groupPolicy: "open"` — Bot Joins Any Group

The bot can be added to any Telegram group. Malicious groups could spam or abuse the bot.

**Recommendation:** Consider `"groupPolicy": "allowlist"` with specific group IDs, or at minimum ensure `requireMention: true` is enforced (which it is via the `groups.*` wildcard).

### 🟢 OK: `groups.*.requireMention: true`

Good — the bot won't respond to every message in groups, only when mentioned. This limits noise and reduces injection surface in groups.

### 🟢 OK: `streamMode: "partial"`

Streaming partial responses is fine for UX. No security concerns.

### ℹ️ INFO: No Safety/Moderation Fields

The config has no `safety`, `moderation`, `inputFilter`, or `promptInjection` fields. This is noted in the separate prompt injection proposal (`telegram-prompt-injection-proposal.md`).

---

## Schema Observations

The config follows the expected OpenClaw telegram channel schema:
- `enabled` (boolean) ✅
- `dmPolicy` (string: "open" | "allowlist" | "disabled") ✅
- `botToken` (string) ✅ (but should be env var)
- `groups` (object with group ID keys) ✅
- `allowFrom` (string array) ✅
- `groupPolicy` (string) ✅
- `streamMode` (string) ✅

No missing required fields. No type mismatches. The main concern is security posture (open access + no injection protection), not schema errors.

---

## Recommended Config Changes

```json
{
  "enabled": true,
  "dmPolicy": "open",
  "botToken": "${TELEGRAM_BOT_TOKEN}",
  "groups": {
    "*": {
      "requireMention": true
    }
  },
  "allowFrom": ["*"],
  "groupPolicy": "open",
  "streamMode": "partial"
}
```

Future additions (when OpenClaw supports them):
```json
{
  "rateLimiting": {
    "perUser": { "messages": 10, "windowSeconds": 60 },
    "global": { "messages": 100, "windowSeconds": 60 }
  },
  "inputFilter": {
    "maxLength": 1000,
    "blockPatterns": ["ignore previous", "system:", "you are now"]
  }
}
```
