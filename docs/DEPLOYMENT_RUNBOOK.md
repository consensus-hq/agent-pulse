# Deployment runbook

## Scope
This runbook covers the **testnet deploy**, verification, env updates, and the required `LINKS.md` updates for Agent Pulse. It also documents the mainnet gating rule: **mainnet deploys only proceed once funding is confirmed**.

## Guardrails (read first)
- **Addresses live only in `LINKS.md`.** Do not paste addresses into docs, README, or code comments.
- **No DEX links at launch.**
- **Mainnet requires funding.** If the deployer wallet is not funded and the Treasury Safe can’t receive fees, stop after the testnet steps.

## Prereqs
- Access to deploy wallet (EOA allowed per hackathon constraints).
- Treasury Safe address confirmed in `LINKS.md`.
- Base testnet RPC and faucet access.
- Vercel project access for `apps/web`.
- `.env.example` is the canonical env list.

## 1) Testnet deploy (Base Sepolia)
1. Confirm the testnet RPC and chain settings.
2. Deploy the $PULSE token (Clanker or approved deploy path).
3. Record the deployed token address and any required contract address.
4. Verify the deployment on the explorer (token + any registry/aux contracts).
5. Update `LINKS.md` with **testnet** values in the Agent Pulse section:
   - `$PULSE token (Base testnet)`
   - `Vercel demo URL` (if testnet UI is deployed)
6. Update Vercel env vars for **testnet** values (see “Env updates” below).
7. Smoke test (testnet):
   - Send **1 PULSE** to the signal sink.
   - Confirm ALIVE state flips to eligible.
   - Confirm inbox key + gated inbox route work end-to-end.

## 2) Verification
- Verify the token contract and any custom contracts on the chain explorer.
- Store the explorer links in deployment notes (do **not** paste addresses in docs).
- Ensure `NEXT_PUBLIC_LAST_RUN_*` reflects the latest verification run for the UI.

## 3) Env updates (Vercel)
Use `apps/web/.env.example` as the single source of truth. Required variables:
- `BASE_RPC_URL`
- `PULSE_TOKEN_ADDRESS`
- `SIGNAL_ADDRESS`
- `NEXT_PUBLIC_BASE_RPC_URL`
- `NEXT_PUBLIC_PULSE_TOKEN_ADDRESS`
- `NEXT_PUBLIC_SIGNAL_ADDRESS`
- `NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS`

Recommended:
- `NEXT_PUBLIC_ALIVE_WINDOW_SECONDS`
- `INBOX_KEY_TTL_SECONDS`
- `NEXT_PUBLIC_INBOX_KEY_TTL_SECONDS`
- `BLOCK_CONFIRMATIONS`
- `BLOCK_TIME_SECONDS`

Optional:
- `REQUIRE_ERC8004`
- `NEXT_PUBLIC_ERC8004_REGISTER_URL`
- `NEXT_PUBLIC_PULSE_FEED_URL`
- `NEXT_PUBLIC_LAST_RUN_STATUS`
- `NEXT_PUBLIC_LAST_RUN_TS`
- `NEXT_PUBLIC_LAST_RUN_NETWORK`
- `NEXT_PUBLIC_LAST_RUN_LOG`

## 4) LINKS.md updates
Update `LINKS.md` after any deploy:
- `$PULSE token (Base testnet)` and `$PULSE token (Base mainnet)`
- `Vercel demo URL`
- Treasury Safe (fee recipient)
- Signal sink (dead address transfer)

Do **not** duplicate these values elsewhere.

## 5) Mainnet deploy gating
Only proceed to mainnet once **all** of the following are true:
- Deployer wallet is funded for gas + deploy.
- Treasury Safe is confirmed as fee recipient.
- Testnet smoke test completed successfully.
- Vercel envs are ready to switch to mainnet values.

If any are missing, stop and document what’s needed to unblock funding.

## 6) Mainnet deploy (Base)
1. Deploy $PULSE on Base mainnet using the same parameters verified on testnet.
2. Verify contracts on BaseScan.
3. Update `LINKS.md` with mainnet token address and Vercel URL.
4. Update Vercel envs to mainnet values.
5. Run the production smoke test:
   - Send **1 PULSE** to the signal sink.
   - Confirm ALIVE eligibility, inbox key, and inbox route.

## 7) Post-deploy checklist
- `LINKS.md` is current and contains all addresses/URLs.
- `NEXT_PUBLIC_LAST_RUN_*` updated for the UI.
- No addresses were added to docs, README, or code comments.
- Submission payload fields can be filled from `LINKS.md`.
