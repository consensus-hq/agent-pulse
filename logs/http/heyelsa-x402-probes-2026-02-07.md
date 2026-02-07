# HeyElsa x402 API probes (2026-02-07)

These probes were run to validate that the upstream HeyElsa x402 API is reachable and returns real data once paid.

## Probe 1 — Unpaid call returns 402 (Payment Required)

ERROR DIAGNOSTIC:
  URL: https://x402-api.heyelsa.ai/api/get_token_price
  Method: POST
  Status: 402
  Status Text: Payment Required
  Body (first ~200 chars): {"x402Version":1,"error":"X-PAYMENT header is required","accepts":[{"scheme":"exact","network":"base","maxAmountRequired":"2000",...
  Interpretation: HeyElsa is up and requires x402 payment.
  Action: Pay using x402 `X-PAYMENT` and retry.

Raw (curl):
```bash
curl -s -w "\n\nHTTP_STATUS: %{http_code}" -X POST https://x402-api.heyelsa.ai/api/get_token_price \
  -H "Content-Type: application/json" \
  -d '{"token_address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","chain":"base"}'
```

## Probe 2 — Paid call returns 200 with JSON

ERROR DIAGNOSTIC:
  URL: https://x402-api.heyelsa.ai/api/get_portfolio
  Method: POST (then POST with X-PAYMENT)
  Status: 200
  Status Text: OK
  Body (first ~200 chars): {"success":true,"wallet_address":"0xDb48A285a559F61EF3B3AFbc7ef5D7Ce9FAAAcd6","network":"base","portfolio":{"balances":[{"chain":"base","asset":"USDC",...
  Interpretation: Payment flow works and HeyElsa returns portfolio data.
  Action: Use server-side payer wallet + cache results.

(Executed via local Node script using EIP-3009 TransferWithAuthorization typed-data signature; output truncated.)
