# News-triggered Curvegrid demo

## One-sentence summary

A local agent recognizes one explicitly configured news fixture, obtains the
existing Zap Pilot deposit review, and deposits 1 USDC from an operator-owned
Base wallet into Morpho, then reports persisted execution evidence in Telegram.
The fixture's interpretation is demo logic, not a general trading strategy.

## MultiBaas usage

MultiBaas Cloud Wallet signs through Azure Key Vault; no private key enters this
app. The authoritative plan comes from account-engine's
`/plan-orchestration/deposit/review`. The adapter uses `/api/v0/hsm/wallets`,
`/api/v0/chains/ethereum/hsm/submit`, and nonce-filtered TXM queries. Actual TXM
`included` plus `failed: false` means success; `failed: true` means revert.
When TXM omits `failed`, the Base receipt decides; inclusion still unresolved at
the poll deadline stops with `needs_attention`.

One arm permits one attempt across all episodes. The database also excludes
concurrent active actions on the same wallet. Each step persists its exact
payload and nonce before submission. Recovery checks the payload, uses the same
nonce only when both latest and pending nonce remain unchanged, and never
rebuilds an expired review. Claims have a two-minute lease with CAS fencing;
active claims are not stolen at startup. A `needs_attention` action reserves the
wallet until an operator reconciles it. Do not modify database status to retry
without checking TXM and the chain.

## Team

Owner to supply team names and hackathon details before submission.

## Setup and testing

Use Node 24 and pnpm 10.30.3. Create a Base Mainnet MultiBaas deployment and one
Azure Cloud Wallet. Maintain less than $5 total value, funded manually (about
2 USDC plus gas). Only this operator wallet is supported. Revocation independent
of the daemon: revoke the MultiBaas API key, disable the Azure key, or withdraw
the wallet balance.

Merge the environment manifest **before** adding `MULTIBAAS_BASE_URL` and
`MULTIBAAS_API_KEY` to Infisical prod. Never use `--client-target news-agent`:
that projection removes signing secrets. The dev environment cannot sign.

```bash
pnpm install
pnpm turbo run build --filter=@zapengine/news-agent^...
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent evaluate --episode <episodes.id> --wallet <operator-eoa>
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent run --once
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent report --limit 20
```

`evaluate` reads only and needs no MultiBaas credentials with `--wallet`.
`run` defaults to dry-run: it persists discovery/decisions, prints review and
guard results, and neither signs nor notifies. Explicit live commands:

```bash
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent smoke
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent run --execute --arm demo
```

`smoke` submits a zero-ETH self-transfer and prints its nonce/hash; do not repeat
an unresolved smoke. `--since` overrides the six-hour discovery window and
`--episode` targets one episode. The demo rule expires at 2026-10-04 00:00 UTC.
Only start the real demo after deployment finishes and the podcast ingest gate
returns to `open`; then submit the fixture PANews URL to the existing bot.
Notifications wait for the zh-Hant video to complete/fail or twelve hours and
link to `/e/<episodeId>?lang=zh-Hant`. Test the universal link on an entitled iOS
build. No podcast pipeline or app UI changes are required.

```bash
pnpm turbo run type-check lint test:coverage deadcode dup:check --filter=@zapengine/news-agent
pnpm verify branch
pnpm lint repo
pnpm format check
pnpm lint dead-env
pnpm env:status --offline
supabase db reset --local --no-seed
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres --no-psqlrc -v ON_ERROR_STOP=1 -f supabase/tests/news_agent_actions.sql
```

Production review, smoke, and Telegram/iOS end-to-end evidence require the
owner's funded EOA and provisioned services. Merging triggers production
services/migration; obtain owner approval before merging.

## MultiBaas feedback

Owner to add observed provisioning, signing, and TXM feedback after the live
smoke and demo; do not present untested behavior as a successful integration.
