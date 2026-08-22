# Zap Pilot Control Center

Read-only founder operations dashboard for cost usage and social telemetry. It
is lifecycle-independent from every production daemon and pipeline.

```bash
pnpm ops:dashboard
```

The Vite UI listens on `127.0.0.1:4174`; its Hono API listens on
`CONTROL_CENTER_PORT` (`4175` by default). Provider responses are cached in
memory for 15 minutes. Use **Refresh data** or `pnpm ops:sync` to bypass that
cache.

## Provider semantics

- OpenRouter: `usage_monthly` from `GET /api/v1/key`, shown as actual accrued
  usage. `OPENROUTER_MANAGEMENT_KEY` takes precedence over the completion key.
- DeBank: balance and daily units from `GET /v1/account/units`. USD remains
  blank unless `DEBANK_UNIT_COST_USD` is explicitly configured, in which case
  it is labeled list-price equivalent.
- Supabase and Fly.io cost rows remain not connected until versioned pricing
  calculators exist. The dashboard does not invent invoice totals.
- Social: reads the existing `social_posts`, `social_post_metrics`, and
  `social_account_snapshots` tables using server-only Supabase credentials.

Vendor credentials are read only by the Hono process. Browser responses contain
normalized usage data and never include tokens.
