# Account Engine

Hono API service for Zap Pilot. Handles user accounts, wallet onboarding, Telegram connection flows, ETL webhook dispatch, and background jobs (weekly reports, strategy-change notifications).

## Stack

- Hono on Node.js — TypeScript
- Supabase PostgreSQL (dual-client: anon + service-role)
- Telegraf (Telegram bot)
- Vitest (tests)

## HTTP surface

Routes grouped under `/users`, `/jobs`, `/etl`, `/telegram`. See `src/routes/`.

## Environment

All env vars live in the monorepo root `.env` (see `.env.example` at repo root). Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ACCOUNT_ENGINE_PORT=3004`.

Weekly-report unsubscribe links use `REPORT_UNSUBSCRIBE_SECRET` when set and
otherwise fall back to `SUPABASE_SERVICE_ROLE_KEY`.
`REPORT_UNSUBSCRIBE_URL` optionally overrides the public confirmation page
(`https://app.zap-pilot.org/unsubscribe` by default).

## Strategy-change notifications

`POST /jobs/strategy-change/batch` (admin API key, no body) reads the committed
backtest curve — `apps/landing-page/src/data/equity-curve.json`, the same
artifact the /track-record chart draws — and Telegram-broadcasts any trade
events newer than the stored cursor. No account or portfolio is involved: the
notification describes the strategy, so every Telegram-connected user gets the
same text and a run with no new events sends nothing.

`TRACK_RECORD_EQUITY_CURVE_URL` overrides the artifact URL; the default is the
raw GitHub file, so freshness follows the daily `Backtest Refresh` commit rather
than a landing-page deploy.

How far the job has announced lives in `strategy_change_notification_state`
(migration `20260820000000_*`), keyed by strategy. The cursor only advances once
a broadcast reached someone, so retries re-send rather than skip. The first run
against a fresh table announces at most the window's last day — the artifact
carries the full trade history and must not be replayed.

Schedule it externally (Pipedream) at ~03:30 UTC, after the 01:30 UTC Backtest
Refresh workflow has committed the day's curve.

## Deployment

Fly.io via Docker — `fly deploy`.

The weekly report scheduler and its completion watchdog are configured in
Pipedream. See
[Pipedream weekly report watchdog](./docs/pipedream-weekly-report-watchdog.md).
