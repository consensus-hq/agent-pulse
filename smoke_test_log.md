# Smoke Test Log (T5.1)

## Metadata
- Date (UTC): 
- Tester: 
- Environment: 
- Vercel URL: 
- Base RPC URL: 
- Wallet used: 
- PULSE token address (from LINKS.md): 
- Signal sink address (from LINKS.md): 
- Alive window (seconds): 
- Inbox key TTL (seconds): 

## Preflight
- [ ] Confirm Vercel env vars match `.env.example` (client + server).
- [ ] Confirm token + sink addresses only appear in `LINKS.md`.
- [ ] Confirm `NEXT_PUBLIC_LAST_RUN_*` metadata (if provided) is visible in UI.

## Step-by-step smoke test

### 1) Open demo UI
- URL opened: 
- Expected: UI loads, no console errors.
- Screenshot: `screenshots/01-ui-home.png`

### 2) Attempt inbox access before pulse (should fail)
- Endpoint: `/api/inbox/<wallet>` (without key)
- Expected: Access denied / requires key.
- Screenshot: `screenshots/02-inbox-prepulse-denied.png`

### 3) Send 1 PULSE to the signal sink
- Action: Transfer **1 PULSE** to burn sink.
- Tx hash: 
- Block number: 
- Explorer link: 
- Screenshot (wallet confirmation or explorer): `screenshots/03-pulse-transfer.png`

### 4) Verify eligibility flips to Alive
- Expected: UI shows Alive / recent pulse.
- Evidence (last-seen time): 
- Screenshot: `screenshots/04-eligible-alive.png`

### 5) Request inbox key (post-pulse)
- Endpoint: `/api/inbox-key` (POST)
- Expected: Key issued (TTL honored).
- Key value (redact after verify): 
- Screenshot: `screenshots/05-inbox-key-issued.png`

### 6) Access inbox with key
- Endpoint: `/api/inbox/<wallet>?key=...`
- Expected: Success response.
- Screenshot: `screenshots/06-inbox-access.png`

### 7) Send test task to inbox
- Endpoint: `/api/inbox/<wallet>` (POST with key)
- Payload summary: 
- Expected: 200 OK + task accepted.
- Screenshot: `screenshots/07-inbox-post.png`

### 8) Verify inbox list includes task
- Endpoint: `/api/inbox/<wallet>?key=...` (GET)
- Expected: Task appears in list.
- Screenshot: `screenshots/08-inbox-list.png`

### 9) Verify transfer-log feed entry
- Expected: Transfer event shows with explorer link.
- Evidence (row content): 
- Screenshot: `screenshots/09-transfer-feed.png`

## Notes / anomalies
- 

## Final verdict
- [ ] PASS
- [ ] FAIL
- Summary: 
