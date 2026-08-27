# Account Engine

Hono API service for Zap Pilot. Handles user accounts, wallet onboarding, Telegram connection flows, ETL webhook dispatch, and background jobs (weekly reports, operator decision packets, strategy-change notifications).

## Stack

- Hono on Node.js — TypeScript
- Supabase PostgreSQL (single service-role client; see CLAUDE.md)
- Telegraf (Telegram bot)
- Vitest (tests)

## HTTP surface

Routes grouped under `/users`, `/jobs`, `/etl`, `/telegram`. See `src/routes/`.

## Environment

Runtime keys are registered in root `config/env.manifest.mjs`. Non-secret values
live in `config/env/dev.env` and `config/env/prod.env`; secrets live in Infisical.
Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`REPORT_UNSUBSCRIBE_SECRET`, `ACCOUNT_ENGINE_PORT=3004`.

Weekly-report unsubscribe links are signed with `REPORT_UNSUBSCRIBE_SECRET`.
It is required rather than derived from a Supabase key so that rotating the
database credential does not invalidate links already sitting in inboxes.
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

GitHub Actions owns this schedule at 03:30 UTC, after the 01:30 UTC Backtest
Refresh workflow has committed the day's curve. The
`strategy-change-broadcast.yml` workflow requires the repository secret
`ADMIN_API_KEY` to match account-engine's Fly secret. A successful HTTP 202
means the in-memory job was accepted; confirm processing and recipient count in
Fly logs. Correct credentials or transient failures, then use **Run workflow**
to retry the same trigger manually.

## Scheduled maintenance

`POST /jobs/maintenance/telegram-token-cleanup` is admin-only and calls the
existing `cleanup_expired_telegram_tokens` database function. GitHub Actions
owns the daily 04:00 UTC trigger through `telegram-token-cleanup.yml`; no schema
migration or automatic database migration apply is involved.

The workflow requires the repository secret `ADMIN_API_KEY` to match Fly. Its
successful response includes `deletedCount`; inspect that output and
account-engine logs during operational verification. After correcting a failed
request, use **Run workflow** to retry it safely.

## Daily decision packet (operator)

`POST /jobs/daily-suggestion/batch` requires the admin API key and a non-empty
JSON body such as `{ "userIds": ["<operator-user-uuid>"] }`. It fetches each
operator's live analytics suggestion and sends Telegram only when
`action.status` is `action_required`. Blocked and no-action decisions stay
quiet on Telegram and remain visible in the authenticated Strategy tab.

The message explains the matched rule, threshold evidence, allocation change,
cooldown, and trade quota. Its **☑️ Done** button records an executed decision
in `strategy_trade_history`; analytics reads that history to enforce the
per-user cooldown and trade-quota guards. It never records skipped decisions.

Run this from an external Pipedream schedule after the alpha ETL daily refresh,
at a different time from the 03:30 UTC public strategy-change broadcast. The
queue and job status are process-memory only: HTTP 202 means accepted, not
completed. Keep the trigger and completion polling in the same workflow using
`GET /jobs/:jobId`, following the
[Pipedream weekly report watchdog](./docs/pipedream-weekly-report-watchdog.md)
pattern. Fly auto-stop, restarts, or requests routed to another machine can
otherwise lose the queued job or its status.

## Deployment

Deployment is owned by the CI deploy registry in root `.github/fly-apps.json`.

The weekly report scheduler and its completion watchdog are configured in
Pipedream. See
[Pipedream weekly report watchdog](./docs/pipedream-weekly-report-watchdog.md).
