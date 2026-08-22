# Zap Pilot Control Center

Founder operations dashboard for persisted cost history and social telemetry. It is lifecycle-independent from production daemons and pipelines.

```bash
pnpm ops:dashboard
```

The Vite UI listens on `127.0.0.1:4174`; its Hono API listens on `CONTROL_CENTER_PORT` (`4175` by default).

## Cost ledger

Cost collection is deliberately separate from dashboard reads:

```text
vendor APIs / fixed pricing / manual Fly estimate
                    ↓
                pnpm ops:sync
                    ↓
             ops.cost_snapshots
                    ↓
              Control Center
```

`GET /api/overview` and `GET /api/costs/history` read persisted snapshots only. **Refresh data** calls `POST /api/costs/sync` first, then reloads the ledger. A vendor outage therefore cannot erase the last known value.

The `ops` schema must be added once to the Supabase project's **Exposed schemas** so PostgREST can reach it. The migration grants only `service_role`; `anon` and `authenticated` have no schema/table access even though the schema is exposed.

## Provider semantics

- OpenRouter: `usage_monthly` from `GET /api/v1/key`, stored as `actual` usage cost. `OPENROUTER_MANAGEMENT_KEY` takes precedence over the completion key.
- DeBank: balance and daily units from `GET /v1/account/units`. The list price is resolved from versioned `ops.cost_rates`; the initial rate is `$200 / 1,000,000 units = $0.0002 / unit`. There is no env price override.
- Supabase: the versioned `pro_plan` rate currently seeds `$25/month`. It is a `fixed` committed monthly cost, so accrued and projected are both `$25` rather than a time-linear estimate.
- Fly.io: Phase 1 is manual. No Playwright/browser scraping is used.

Usage/economic cost and cash accounting are separate invariants:

```text
ops.cost_snapshots    = operating / usage-equivalent cost
ops.cost_transactions = actual charges, top-ups, subscriptions, invoices
```

A `$200` DeBank top-up therefore never makes current-month API usage appear to be `$200`.

## Commands

Sync all automatic providers and persist today's snapshots:

```bash
pnpm ops:sync
```

Record a manual Fly current-month estimate:

```bash
pnpm ops:cost snapshot fly 18.43
```

Record a real invoice / charge separately:

```bash
pnpm ops:cost transaction fly invoice 21.07 "August invoice"
pnpm ops:cost transaction debank top_up 200 "1M API units"
```

Run `pnpm ops:sync` daily from any scheduler (launchd, cron, or a future Fly scheduler). The collector is scheduler-agnostic and does not depend on the Control Center process being alive.

Vendor credentials and Supabase service-role credentials are read only by the Hono/CLI process. Browser responses contain normalized ledger data and never include tokens.
