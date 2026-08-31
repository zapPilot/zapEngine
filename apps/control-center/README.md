# Zap Pilot Control Center

Founder decision dashboard for operational status, customer economics, product health, persisted cost history, and learned social publishing guidance. It is lifecycle-independent from production daemons and pipelines.

```bash
pnpm ops             # dashboard + social daemon, from the repository root
pnpm ops:dashboard   # dashboard only
pnpm ops --status    # one-shot status in the terminal, no server
pnpm ops --status --json   # the same snapshot as JSON, for an agent
```

`--json` and `--force` only mean anything alongside `--status`; passing either on its own, or with `--dashboard`/`--social`, is rejected rather than silently ignored.

`pnpm ops` starts the dashboard and the social publishing daemon as **independent** children: a dashboard that crashes must never take publishing down with it, and vice versa. Only `SIGINT`/`SIGTERM` are forwarded to both.

The Vite UI listens on `127.0.0.1:4174`; its Hono API listens on `CONTROL_CENTER_PORT` (`4175` by default).

## Views

Five views, each answering one question. Home is a decision surface; the other
four are where its evidence lives.

| View            | Question it answers                                          | Reads                                                    |
| --------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| **Home**        | What needs a decision right now?                             | `/api/overview`, `/api/costs/history`, `/api/operations` |
| **Growth**      | What should we publish next, and what did the last posts do? | `/api/social-performance`                                |
| **Product**     | Who do we serve, and is their data still current?            | `/api/customers` + product health from `/api/overview`   |
| **Reliability** | Which sources are telling us something is wrong?             | `/api/operations`, `/api/operations/social`              |
| **Economics**   | What does the company spend, and which provider spends it?   | `/api/overview`, `/api/costs/history`                    |

Home opens on the ranked action queue rather than on a metric grid: the queue is
the only part of the dashboard that says what to do, and it went unread while it
lived one tab away. The KPI band sits below it, grouped by concern rather than
spread across six equal tiles, and the provider ledger has exactly one home —
Economics.

Because the queue is the first thing on the first screen, `/api/operations` is
part of the first paint. Its per-source caches absorb the repeat reads; the
per-customer ledger and the publish queue stay lazy because neither appears on
Home.

The interface is a single dark surface built on `@zapengine/design-tokens`.
There is no light variant: the tokens are authored dark-first and the product
has no light expression to match. Colours in `src/client/styles.css` are aliases
of those tokens — `healthy` is `--success`, `degraded` is `--warning`,
`critical` is `--error`, and `unknown` is `--ink-faint`, deliberately grey
rather than green.

## Vercel deployment

The Vercel deployment is a remote Control Center surface. Dashboard HTTP views remain read-only, while `/api/mcp` exposes the separately authenticated Ops MCP; its only current write capability is the narrowly allowlisted single-issue Sentry resolve operation documented in [`MCP.md`](./MCP.md). Configure the project root as `apps/control-center` and enable Vercel Authentication for all deployments before adding credentials or performing the first deployment. The remote API deliberately does not register `POST /api/costs/sync`; cost collection remains an external operation. Fly operational signals use the Fly Machines HTTP API and require `FLY_OPS_TOKEN`; they do not depend on `flyctl` being installed in Vercel.

The remote server uses these environment variables as applicable to its read paths and bounded MCP remediation path:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA` (only when using a non-default schema)
- `OPS_GITHUB_TOKEN`
- `FLY_OPS_TOKEN`
- `SENTRY_OPS_AUTH_TOKEN`
- `SENTRY_OPS_WRITE_TOKEN` (only for the bounded Sentry resolve tool)
- `SENTRY_ORG_SLUG`
- `POSTHOG_PERSONAL_API_KEY`
- `POSTHOG_PROJECT_ID`
- `SENTRY_CONTROL_CENTER_DSN`
- `OPS_MCP_TOKEN` (remote MCP client authentication only)

Do not deploy `DEBANK_*` or `OPENROUTER_*` credentials; they are used only by
cost synchronization. Set `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel honors the repository's
`pnpm@10.30.3` package manager declaration. Force refresh fans out to the
operational adapters, each with a 10-second timeout; if the selected Vercel plan
defaults to a function duration below 15 seconds, configure a longer
`functions.maxDuration` in `vercel.json`.

## Operations snapshot

`GET /api/operations` is one read model for "is anything wrong, and what should I do first", shared by Home's action queue, the Reliability view, and `pnpm ops --status` (`--json` for agents; exit code 1 when anything is `critical`).

Every source is an adapter that returns `OperationalSignal[]` and is contractually forbidden from throwing. Missing credentials produce `unknown`, never `healthy` — a provider nobody asked has not reported that it is fine — and a failed request produces a `degraded` source failure so a lost reading is visibly different from a healthy one.

| Domain      | Source                           | Reads                                                                               |
| ----------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `customers` | `customer-economics`             | `public.get_user_service_states()` + the usage ledger                               |
| `product`   | `product-health`                 | the existing public-schema account data                                             |
| `costs`     | `cost-ledger`                    | `ops.cost_snapshots` through the bridge, plus its own staleness                     |
| `social`    | `social-queue` / `social-daemon` | `social_publish_jobs`, `social_daemon_state`, waiting media                         |
| `jobs`      | `github-actions`                 | `schedule`-triggered runs of the github-actions entries in `.github/schedules.json` |
| `infra`     | `fly`                            | Fly Machines HTTP API state per app and process group                               |

Job health reads `event=schedule` runs only. A workflow carries both a cron and a `workflow_dispatch` trigger, so counting manual runs would let a successful re-run mask a cron that has stopped firing — the exact failure this domain exists to catch. Staleness is derived from each entry's own cron expression rather than assumed daily, floored at 48h.

A stopped Machine is not an outage everywhere. `account-engine`, `alpha-etl`, and `analytics-engine-xws3ra` declare `min_machines_running = 0`, so Fly Proxy stops them when idle and starts them on the next request; the podcast render group stops itself on an idle queue. Scoring those on started count would leave the page permanently red, which is the one failure a status page cannot survive — so they are scored on whether anything is left to start instead. The lifecycle each app is judged by restates its own `fly.toml`, and `fly.test.ts` reads those files to prove the two still agree.
| `errors` | `sentry` | unresolved issues in the last 24h, grouped by project |
| `analytics` | `posthog` | 7d/30d unique users |

All eight domains appear in every response even when nothing reported on them: an absent domain in a status page reads as a green light.

Ranking is deterministic (`services/operations/prioritize.ts`) rather than model-generated, so the dashboard and an agent agree on what matters: a status base, a domain weight, and capped boosts for evidence like overdue minutes, failure streaks, affected users, and AUM at risk. The threshold is set so an `unknown` signal can never reach the action list — an unconfigured integration is a setup task, not an incident.

Every source has its own cache TTL, from 30s for the publish queue to 15 minutes for PostHog. `?force=1` bypasses them, which is what **Refresh** uses on Reliability and Product.

### Provider credentials

These ship dark. Their adapters report `unknown` and send no request until the credential exists, so nothing here is required to run the dashboard.

- `OPS_GITHUB_TOKEN` — fine-grained PAT, `zapPilot/zapEngine` Actions: read. Without it no request is made at all: anonymous `api.github.com` is capped at 60 requests/hour per IP.
- `FLY_OPS_TOKEN` — read-only Fly organization token used by the Machines HTTP API for fleet state and incident inspection.
- `SENTRY_OPS_AUTH_TOKEN` + `SENTRY_ORG_SLUG` — `org:read`, `project:read`, `event:read`.
- `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID` — `query:read`.

The read credentials remain separate from `SENTRY_OPS_WRITE_TOKEN`, whose only caller is the bounded Sentry issue-resolution path described in [`MCP.md`](./MCP.md). `OPS_MCP_TOKEN` authenticates remote MCP clients and is not a provider credential.

Non-secret identifiers belong in `config/env/*.env`; sensitive tokens belong in Infisical.

## Customer economics

`GET /api/customers` answers who is being served, at what service level, and what serving them costs.

Service policy has one source of truth, `public.get_user_service_states()`, deliberately in SQL: `apps/alpha-etl` reads the same rows to decide which wallets to refresh, so the dashboard cannot report Standard for an account the pipeline is still billing as Priority. It returns commercial entitlement (`plan_code`), the operator override from `ops.user_service_overrides`, the resulting effective tier, the refresh cadence, and whether a wallet is due.

Standard (free) accounts are returned but not scheduled — visible to operations, costing nothing. Turning weekly refresh on for them is a one-line change to the cadence expression in that function.

Three numbers on that page are deliberately imprecise, and say so:

- **Cost** is an allocation, not a measurement. DeBank bills one monthly account figure in API units and publishes no per-endpoint price, so a user's share is their request volume out of the total, always labelled `allocated_estimate`. The request counts themselves are real: `apps/alpha-etl` records them per wallet through `public.ops_record_user_resource_usage`.
- **Revenue** is `Unknown`. Nothing in this repository bills anybody, and a plausible number would be worse than none.
- **Last active** is account-engine route activity (dashboard visits), debounced hourly. It is not whole-product usage — nothing else writes `users.last_activity_at`.

Service-tier controls in the detail panel are disabled and marked `WIP`: there is no mutation endpoint yet, and a control that silently does nothing would let an operator believe an account had been paused. Apply overrides directly against `ops.user_service_overrides` until it is wired.

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

`GET /api/overview` and `GET /api/costs/history` read persisted cost snapshots directly on every request, so an external `pnpm ops:sync` is visible immediately rather than waiting for an in-process cache TTL. Social aggregation alone keeps the short in-memory cache. On a local development build **Refresh** calls `POST /api/costs/sync` first and then reloads the ledger; a production build only rereads snapshots, and the remote deployment does not register the route at all.

The `ops` schema stays private and is not exposed through Supabase Data API. Control Center reaches it through service-role-only views and write RPCs in the already exposed `from_fed_to_chain` schema. `anon` and `authenticated` receive no access to the bridge or the underlying ledger.

### Podcast unit economics

`ops.cost_snapshots` is per-provider and monthly, so it cannot say what one episode cost. `ops.pipeline_runs` and `ops.pipeline_stage_runs` sit beside it and do: one row per background work unit, one row per billable stage, keyed by episode, localization, language and stage (`script` / `translation` / `narration` / `classroom` / `other` / `video_render`). `apps/podcast-pipeline` writes them; see its README's "Pipeline cost ledger" for what each column means and which costs are deliberately not in there.

Control Center reads this ledger through `GET /api/costs/podcast` and presents episode-level unit economics in the Economics view. The read path uses the service-role-only bridge views `from_fed_to_chain.ops_pipeline_runs` and `from_fed_to_chain.ops_pipeline_stage_runs`; the browser receives only the aggregated cost response.

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
pnpm ops:sync
```

Enable the Fly compute run-rate collector (requires `flyctl auth login` on the machine running the collector):

```bash
FLY_COST_MODE=flyctl pnpm turbo run ops:sync --filter=@zapengine/control-center --env-mode=loose
```

The daily GitHub Actions workflow sets `FLY_COST_MODE=flyctl` and uses the
official Fly CLI setup action. Local manual runs use the explicit command above.

Record a manual Fly current-month estimate instead:

```bash
pnpm ops:cost snapshot fly 18.43
```

Record a real invoice / charge separately:

```bash
pnpm ops:cost transaction fly invoice 21.07 "August invoice"
pnpm ops:cost transaction debank top_up 200 "1M API units"
```

GitHub Actions is the sole recurring owner and runs `pnpm ops:sync` daily at
04:30 UTC through `.github/workflows/ops-cost-sync.yml`. It requires these
repository secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`DEBANK_API_KEY`, `OPENROUTER_MANAGEMENT_KEY`, and `FLY_API_TOKEN`. The Fly token
must allow the CLI to inspect the deployed Zap Engine apps.

For recovery, inspect the failed workflow step and provider summary, correct
the affected credential or provider outage, then use **Run workflow**. Confirm
that the run reports persisted snapshots and that `ops.cost_snapshots` contains
fresh rows before considering the sync recovered. Do not add a second cron or
operator-Mac trigger.

Vendor credentials and Supabase service-role credentials are read only by the Hono/CLI process. Browser responses contain normalized ledger data and never include tokens.

## Decision layers

The Product view reads product health from the existing public-schema account data: registered users, verified wallets, users with observed portfolio data, WAU/MAU, observed portfolio value, freshness coverage, and portfolio concentration. The portfolio value is deliberately labeled **observed**, not authoritative AUM, because coverage/freshness are part of the decision.

Social decisions reuse the pipeline's active `social_strategy_versions` rather than implementing a second learner. Control Center supplements those preferred hook/hashtag choices with simple 24-hour evidence for timing and topic, reports the learner sample count/confidence, and keeps raw per-post metrics as a secondary evidence layer. Platform-specific decision signals replace universal columns that had no producer (for example impressions, cover CTR, and media-quality score).
