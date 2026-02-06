# Badge Endpoint Receipt

**Agent:** T6-BADGE  
**Date:** 2026-02-06  
**Status:** ✅ Complete

## File Created

`apps/web/src/app/api/badge/[address]/route.ts`

## Endpoint

```
GET /api/badge/{address}
```

**Content-Type:** `image/svg+xml`  
**Runtime:** Edge  
**Cache:** `Cache-Control: public, max-age=300` (5 min)

## Embed Usage

```markdown
![Agent Status](https://agent-pulse-nine.vercel.app/api/badge/0xYOUR_ADDRESS_HERE)
```

## Badge Design

Shields.io-style flat badge with four segments:

| Section | Content | Color |
|---------|---------|-------|
| **Label** | `●  Agent Pulse` | Dark grey `#555` with green/red status dot |
| **Status** | `alive` / `dead` / `unknown` | Green `#4c1` / Red `#e05d44` / Grey `#9f9f9f` |
| **Streak** | `Streak: N` | Blue `#007ec6` |
| **Hazard** | `low` / `medium` / `high` / `critical` | Green → Yellow → Orange → Red |

### Hazard Thresholds

| Score | Level | Color |
|-------|-------|-------|
| 0–25 | low | `#4c1` (green) |
| 26–50 | medium | `#dfb317` (yellow) |
| 51–75 | high | `#fe7d37` (orange) |
| 76–100 | critical | `#e05d44` (red) |

## Data Flow

1. **KV cache** → checked first (same `getAgentState()` used by `/api/status/[address]`)
2. **On-chain** → fallback via `readAgentStatus()` + `readTTL()` from `@/app/lib/chain`
3. **Error/invalid** → returns a graceful "unknown" badge (never a broken image)

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Invalid address (not `0x` + 40 hex) | Returns `unknown` badge, `X-Badge-Status: invalid-address` |
| Chain read failure | Returns `unknown` badge, `X-Badge-Status: error`, 60s cache |
| KV miss + chain success | Returns live badge from chain data |
| KV hit | Returns cached badge |

## Architecture Notes

- Uses `new Response()` instead of `NextResponse.json()` since we return SVG, not JSON
- XSS-safe: all text values pass through `escapeXml()` before SVG embedding
- Text width approximation uses character-class widths for Verdana 11px (shields.io standard)
- No rate limiting (badges are CDN-cacheable; 5 min `max-age` handles thundering herd)
- Follows same import patterns as `apps/web/src/app/api/status/[address]/route.ts`
