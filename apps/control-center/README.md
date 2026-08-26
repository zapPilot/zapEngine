# Zap Pilot Control Center

Founder decision dashboard for product health, persisted cost history, and learned social publishing guidance. It is lifecycle-independent from production daemons and pipelines.

```bash
infisical run --env=prod -- pnpm ops:dashboard
```

The Vite UI listens on `127.0.0.1:4174`; its Hono API listens on `CONTROL_CENTER_PORT` (`4175` by default).

Supabase service-role credentials and vendor keys live in Infisical `prod`, so every command here needs the same `infisical run` wrapper. Without it the API process refuses to start rather than serving a dashboard whose every panel reads empty.

## Cost ledger

Cost collection is deliberately separate from dashboard reads:

```text
vendor APIs / fixed pricing / Fly run-rate or manual estimate
                    ↓
                pnpm ops:sync
                    ↓
             ops.cost_snapshots
                    ↓
              Control Center
```

`GET /api/overview` and `GET /api/costs/history` read persisted cost snapshots directly on every request, so an external `pnpm ops:sync` is visible immediately rather than waiting for an in-process cache TTL. Social aggregation alone keeps the short in-memory cache. **Refresh data** calls `POST /api/costs/sync` first, then reloads the ledger.

The `ops` schema stays private and is not exposed through Supabase Data API. Control Center reaches it through service-role-only views and write RPCs in the already exposed `from_fed_to_chain` schema. `anon` and `authenticated` receive no access to the bridge or the underlying ledger.

## Provider semantics

- OpenRouter: `usage_monthly` from `GET /api/v1/key`, stored as `actual` usage cost. `OPENROUTER_MANAGEMENT_KEY` takes precedence over the completion key.
- DeBank: balance and daily units from `GET /v1/account/units`. The list price is resolved from versioned `ops.cost_rates`; the initial rate is `$200 / 1,000,000 units = $0.0002 / unit`. There is no env price override.
- Supabase: the versioned `pro_plan` rate currently seeds `$25/month`. It is a `fixed` committed monthly cost, so accrued and projected are both `$25` rather than a time-linear estimate.
- Fly.io: defaults to manual invoice estimates. Set `FLY_COST_MODE=flyctl` for the local founder dashboard to inspect the authenticated official Fly CLI and persist a current compute monthly run-rate. The estimate intentionally excludes historical runtime, stopped-Machine rootfs, bandwidth, dedicated IPs, certificates, reservations, and other invoice adjustments, so actual cash spend still belongs in `cost_transactions`.

Usage/economic cost and cash accounting are separate invariants:

```text
ops.cost_snapshots    = operating / usage-equivalent cost
ops.cost_transactions = actual charges, top-ups, subscriptions, invoices
```

A `$200` DeBank top-up therefore never makes current-month API usage appear to be `$200`.

## Commands

Sync all automatic providers and persist today's snapshots:

```bash
infisical run --env=prod -- pnpm ops:sync
```

It exits non-zero when a provider the configuration expects lands no snapshot,
even if the others did: Supabase is a fixed-rate provider with no credential of
its own, so a run that persisted something is not evidence that a revoked vendor
key was noticed. Fly.io reporting `Not connected` under the default
`FLY_COST_MODE=manual` is an operator choice, not a failure.

Enable the Fly compute run-rate collector (requires `flyctl auth login` on the machine running the collector):

```bash
FLY_COST_MODE=flyctl infisical run --env=prod -- pnpm ops:sync
```

The daily GitHub Actions workflow sets `FLY_COST_MODE=flyctl` and uses the
official Fly CLI setup action.

Record a manual Fly current-month estimate instead:

```bash
infisical run --env=prod -- pnpm ops:cost snapshot fly 18.43
```

Record a real invoice / charge separately:

```bash
infisical run --env=prod -- pnpm ops:cost transaction fly invoice 21.07 "August invoice"
infisical run --env=prod -- pnpm ops:cost transaction debank top_up 200 "1M API units"
```

GitHub Actions is the sole recurring owner and runs `pnpm ops:sync` daily at
04:30 UTC through `.github/workflows/ops-cost-sync.yml`. It reads vendor and
Supabase credentials from Infisical `prod` through the same universal-auth
identity as the environment-drift workflow, so its only repository secrets are
`INFISICAL_UNIVERSAL_AUTH_CLIENT_ID`, `INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET`,
`INFISICAL_PROJECT_ID`, and `FLY_API_TOKEN`. The Fly token must allow the CLI to
inspect the deployed Zap Engine apps.

For recovery, inspect the failed workflow step and provider summary, correct
the affected credential or provider outage, then use **Run workflow**. Confirm
that the run reports persisted snapshots and that `ops.cost_snapshots` contains
fresh rows before considering the sync recovered. Do not add a second cron or
operator-Mac trigger.

Vendor credentials and Supabase service-role credentials are read only by the Hono/CLI process. Browser responses contain normalized ledger data and never include tokens.

## Decision layers

The overview reads product health from the existing public-schema account data: registered users, verified wallets, users with observed portfolio data, WAU/MAU, observed portfolio value, freshness coverage, and portfolio concentration. The portfolio value is deliberately labeled **observed**, not authoritative AUM, because coverage/freshness are part of the decision.

Social decisions reuse the pipeline's active `social_strategy_versions` rather than implementing a second learner. Control Center supplements those preferred hook/hashtag choices with simple 24-hour evidence for timing and topic, reports the learner sample count/confidence, and keeps raw per-post metrics as a secondary evidence layer. Platform-specific decision signals replace universal columns that had no producer (for example impressions, cover CTR, and media-quality score).
