# Zap Pilot Control Center

Founder decision dashboard for operational status, customer economics, product health, persisted cost history, learned social publishing guidance, and podcast production recovery. It is lifecycle-independent from production daemons and pipelines.

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

Six views, each answering one question. Home is a decision surface; the other
five are where its evidence or narrow operator actions live.

| View            | Question it answers                                                         | Reads / actions                                                                                                     |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Home**        | What needs a decision right now?                                            | `/api/overview`, `/api/costs/history`, `/api/operations`                                                            |
| **Pipeline**    | Where is each article, what failed, and can its current phase be recovered? | `/api/podcast-pipeline`, lazy `/api/podcast-pipeline/:episodeId/visual`, per-step restart actions, operator reviews |
| **Growth**      | What should we publish next, and what did the last posts do?                | `/api/social-performance`                                                                                           |
| **Product**     | Who do we serve, and is their data still current?                           | `/api/customers` + product health from `/api/overview`                                                              |
| **Reliability** | Which sources are telling us something is wrong?                            | `/api/operations`, `/api/operations/social`                                                                         |
| **Economics**   | What does the company spend, and which provider spends it?                  | `/api/overview`, `/api/costs/history`                                                                               |

Home opens on priority-sorted founder statements rather than on a metric grid.
Each statement carries its conclusion and evidence; the Reliability statement can
disclose the bounded action queue when operator action is warranted. The KPI band
sits below the statements, grouped by concern rather than spread across six equal
tiles, and the provider ledger has exactly one home — Economics.

Because operational evidence is part of the first screen, `/api/operations` is
part of the first paint. Its per-source caches absorb the repeat reads; the
podcast pipeline, per-customer ledger, and publish queue stay lazy because none
appears directly on Home.

The Pipeline view is one queue board — API → Render → Social publishing — and
every operator action lives in the drawer a card opens. `GET /api/pipeline/queues`
decides per job whether a restart is offered, because the episode read model only
covers the 40 most recent episodes and the jobs most in need of a retry are older
than that; a job the RPCs would refuse carries a `disabledReason` instead of a
button. Video work an operator has closed leaves the lanes entirely and is
counted separately, so a wall of abandoned rows cannot bury the handful of jobs
that are still rescuable. The drawer's **Scenes** tab is the visual evidence for
one episode — every image search, the candidates it returned and why each was
dropped, and for each scene the image, its caption and the query that won it —
with a per-scene review editor writing to `episode_video_reviews`.

The view derives its state directly from production sources of truth:
`episode_localizations` for script/translation/TTS readiness,
`podcast_ingest_jobs` for current durable ingest work, `ops_pipeline_runs` as the
historical fallback for pre-durable ingest failures, `episode_video_visuals` for
shared visual planning, and `episode_videos` for the three language renders. A
terminal ingest or visual failure is shown as failed even when downstream rows
are absent or queued; the dashboard must never translate that state into a vague
"still processing" message. Two more states come straight from the rows: a
language with no `episode_videos` row is **Not scheduled** (`unscheduled`, not
queued — older episodes only ever rendered `zh-Hant`), and a queued or expired
job whose `visual_version` differs from the deployed
`EPISODE_VIDEO_VISUAL_VERSION` is **Stale version** (`stale`): no worker will
ever claim it, so it counts as stuck for the pipeline statement and the
restart button is what repairs it. A third derived state closes an episode for
good: an `episode_video_visuals` row carrying `abandoned_at` is **Abandoned**
(`abandoned`), which files the episode under Completed, shows the operator's
recorded reason, and removes every restart affordance — the underlying rows keep
whatever state they died in, so this says nobody should restart them rather than
that the work succeeded. Completed jobs hide their last progress
stage, and `podcast_ingest_jobs.failure_history` is shown as the recent ingest
retry history.

Every episode card has a lazy **Visual plan, search trace and review** panel
(`GET /api/podcast-pipeline/:episodeId/visual`). It reads the persisted
`visual_payload` (per-scene image search intents, entities, subject assignment,
selected asset with provider/license, the provider search trace, the
zh-Hant sentence text, generated concept cards) and, for failed attempts,
`last_failure_diagnostics` (stage, message, redacted planning snapshot). The
parser is deliberately lenient: payload shapes from v1 through v9 render what
they have and unknown shapes fall back to the raw JSON rather than a 500. The
same panel is where the operator grades the episode or a single scene
(verdict, issue categories, note); the review row stores a `pipelineContext`
snapshot so the feedback stays interpretable after prompts change. Control
Center never runs model inference on that feedback — a Claude Code session
reads `episode_video_reviews` (see the podcast-pipeline README "Visual review
loop") and marks reviews triaged; the operator marks them resolved here.

The interface uses a light, high-contrast operator palette. Shared
`@zapengine/design-tokens` still provide typography, spacing, radii, and the
base semantic names, while `src/client/styles.css` overrides Control Center's
colour aliases for legibility. `healthy` is `--success`, `degraded` is
`--warning`, `critical` is `--error`, and `unknown` is `--ink-faint`,
deliberately grey rather than green.

## Vercel deployment

The Vercel deployment is a remote Control Center operator surface. Configure the project root as `apps/control-center` and enable Vercel Authentication for all deployments before adding credentials or performing the first deployment.

Dashboard HTTP views are generally read-only, with three narrowly bounded classes of mutation:

- `/api/mcp` exposes the separately authenticated Ops MCP. Its only current write capability is the narrowly allowlisted single-issue Sentry resolve operation documented in [`MCP.md`](./MCP.md).
- Pipeline step restarts, each a named service-role-only RPC that touches only job rows and never scripts, translation, narration, classroom audio, or arbitrary tables, and each refusing while a live lease exists (mapped to `409`):
  - `POST /api/podcast-pipeline/:episodeId/ingest/retry` → `restart_podcast_ingest`. Requeues the durable ingest job so the app process resumes from the last committed localization stage; refused once all three audio localizations are complete. The RPC recovers the Telegram chat id from any earlier ingest, visual, or render row of the episode, so the original submitter is still notified; only an episode with no such row gets a silent operator job.
  - `POST /api/podcast-pipeline/:episodeId/video/retry` with `{ "forceReplan": boolean }` → `retry_episode_video_generation`. Materializes missing `ja`/`en` render rows, keeps a completed current-version visual and requeues only unfinished renders; `forceReplan: true` (the two-click **Re-plan visuals** button at the foot of the drawer's Scenes tab) discards the visual checkpoint and re-renders all three languages. That button appears only once the plan on screen is completed at the current visual version, which is the only case an ordinary restart cannot already fix — a stale or failed checkpoint is re-planned by the plain retry. The service omits `p_force_replan` on the ordinary retry so the call still resolves before the migration is applied. An abandoned episode is refused with `22023` (mapped to `409`), before the release fence is consulted, so the answer names the closure rather than a version mismatch.
  - `POST /api/podcast-pipeline/:episodeId/renders/:localizationId/retry` → `retry_episode_video_render`. Requeues one language render against the completed current-version visual; also refused with `22023` on an abandoned episode.
- Operator reviews: `PUT /api/podcast-pipeline/:episodeId/reviews` → `upsert_episode_video_review` and `POST /api/podcast-pipeline/reviews/:reviewId/resolve` → `resolve_episode_video_review` write only the operator's review rows (`reviewer = 'operator'`); they cannot change pipeline state.

Code deploys before the operator pushes the Supabase migrations, so every new route degrades explicitly: a missing RPC (`PGRST202` / `42883`) answers `503` with "migration has not been applied yet", and reads of not-yet-existing columns or tables (`42703`, `42P01`) are separate queries that fall back to empty values. Vercel Authentication is the load-bearing boundary for all of these operator actions.

The remote API deliberately does not register `POST /api/costs/sync`; cost collection remains an external operation.

Fly operational signals use the Fly Machines HTTP API and require `FLY_OPS_TOKEN`; they do not depend on `flyctl` being installed in Vercel.

The remote server uses these environment variables as applicable to its read paths and bounded remediation paths:

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

`GET /api/operations` is one read model for "is anything wrong, and what should I do first", shared by Home's statement evidence, the Reliability view, and `pnpm ops --status` (`--json` for agents; exit code 1 when anything is `critical`).

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

**Control Center must not call an LLM inference API.** Reliability summaries, priorities, statements, and recommended decisions are rule-based and must remain reproducible without paid model inference. OpenRouter credentials in this app are cost-observability credentials only: they may read provider usage/cost metadata, but they must never be used for chat/completions, Responses API, or other generation endpoints. `src/server/ai-boundary.test.ts` enforces this boundary at the dependency and production-source level.

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
vendor APIs / fixed pricing / operator-recorded billed figures
                    ↓
                pnpm ops:sync
                    ↓
             ops.cost_snapshots
                    ↓
              Control Center
```

Only a figure we expect to pay enters a snapshot as cost. Usage evidence — request counts, unit balances, the Fly compute run-rate — travels in the same snapshot's `usage` array, where it can inform a decision without ever being read back as a bill.

`GET /api/overview` and `GET /api/costs/history` read persisted cost snapshots directly on every request, so an external `pnpm ops:sync` is visible immediately rather than waiting for an in-process cache TTL. Social aggregation alone keeps the short in-memory cache. On a local development build **Refresh** calls `POST /api/costs/sync` first and then reloads the ledger; a production build only rereads snapshots, and the remote deployment does not register the route at all.

The `ops` schema stays private and is not exposed through Supabase Data API. Control Center reaches it through service-role-only views and write RPCs in the already exposed `from_fed_to_chain` schema. `anon` and `authenticated` receive no access to the bridge or the underlying ledger.

### Podcast unit economics

`ops.cost_snapshots` is per-provider and monthly, so it cannot say what one episode cost. `ops.pipeline_runs` and `ops.pipeline_stage_runs` sit beside it and do: one row per background work unit, one row per billable stage, keyed by episode, localization, language and stage (`script` / `translation` / `narration` / `classroom` / `other` / `video_render`). `apps/podcast-pipeline` writes them; see its README's "Pipeline cost ledger" for what each column means and which costs are deliberately not in there.

Control Center reads this ledger through `GET /api/costs/podcast` and presents episode-level unit economics in the Economics view. The read path uses the service-role-only bridge views `from_fed_to_chain.ops_pipeline_runs` and `from_fed_to_chain.ops_pipeline_stage_runs`; the browser receives only the aggregated cost response.

## Provider semantics

- OpenRouter: `usage_monthly` from `GET /api/v1/key`, stored as `actual` usage cost. `OPENROUTER_MANAGEMENT_KEY` takes precedence over the completion key. For the first seven days of a month its month-end projection blends the current month's pace with the previous month's daily rate, weighted further toward the current month each day and identical to plain linear extrapolation from day seven onward. A month that has barely started is a weak sample: extrapolating the 9.5 hours of traffic on the 1st turned a real `$0.13` month-to-date into a `$9.67` projection, while last month's rate is a serviceable prior until the current one has enough days to speak for itself.
- DeBank: balance and daily units from `GET /v1/account/units`. The list price is resolved from versioned `ops.cost_rates`; the initial rate is `$200 / 1,000,000 units = $0.0002 / unit`. There is no env price override. Its projection uses the same early-month blend, for the same reason.
- Brave Search: every sync performs one successful Images Search request because Brave has no separate usage endpoint; that probe is itself billable and counted against the quota. The collector selects the longest advertised rate-limit window, rejects responses that expose only a sub-day window, and prices `limit - remaining` using the versioned `search_request` rate (`$5 / 1,000 requests`). It records gross list-price-equivalent cost and separately displays the hard-coded `$5` monthly promotional credit and estimated post-credit bill. Brave's documented long window is a rolling 30-day window rather than a calendar-month counter, so the stored accrued value and month-end projection are operational estimates: a mid-month quota reset can make both understate calendar-month activity until request deltas are accumulated independently.
- Supabase: the versioned `pro_plan` rate currently seeds `$25/month`. It is a `fixed` committed monthly cost, so accrued and projected are both `$25` rather than a time-linear estimate. In the UI, accrued therefore means fixed monthly commitments plus variable usage accrued so far; it is not a day-by-day prorated cash charge.
- Fly.io: month-end spend comes only from an operator reading the billed month-to-date figure off the Fly dashboard and recording it with `pnpm ops:cost snapshot fly <usd>`. Fly publishes no billing or usage API — `flyctl` can only open the dashboard in a browser — so there is nothing to collect. `FLY_COST_MODE=flyctl` therefore gathers evidence rather than cost: it persists a compute run-rate under the `compute_run_rate_monthly` usage key alongside the Machine census, and leaves accrued and projected empty. That run-rate is what every Machine currently in state `started` would cost at list price if it ran for the whole month, which is a saturation ceiling and not a forecast — Fly bills per second, the collector only ever sees one instant, the podcast render group is on-demand and up for minutes at a time, and a stopped Machine pays only rootfs at `$0.15/GB/month`. One performance-2x that happened to be rendering at 04:30 UTC was accordingly priced at a full month (`2 × $32.19`) and produced a `$67.70` projection against a real bill of about `$14`. The run-rate is equally blind to historical runtime, bandwidth, dedicated IPs, certificates, reservations, and other invoice adjustments, so actual cash spend still belongs in `cost_transactions`.

The recorded Fly figure is a month-to-date reading, not a month-end one: it is the billed amount for the month so far, and it is stored as both accrued and projected. Fly's contribution to "Projected month-end" is therefore a floor as of the moment the operator read it, not a forecast, and it understates the month the earlier in the month it was read. Extrapolating it the way OpenRouter and DeBank are extrapolated was rejected deliberately: inflating a real `$14` read on the 2nd into a `~$210` month-end would recreate the exact failure this change removed, pointed the other way. An honest floor that is visibly a floor beats a confident number that is wrong.

The previous-month figure that damps those early-month projections is an approximation, and is only ever used as one. `previousMonthByProvider` is the last snapshot of the previous month — that month's spend as of its final sync at 04:30 UTC on its last day, not a true month total — so it reads slightly low, and a provider that only started reporting mid-month contributes a low prior for the first seven days of the next one. That is accepted because the number is a damping weight rather than an accounting figure: its whole job is to stop a four-hour sample from speaking for thirty days, and from day seven it carries no weight at all.

`projectedCostUsd` carries one meaning for every provider: what we expect to actually pay for this month. A theoretical ceiling is not that, so a provider with nothing recordable is left out of the headline numbers rather than filled in with a plausible one. The Economics view's Accrued and Projected tiles name the providers they had to exclude, and a Fly row holding only a run-rate reports its basis as `Estimated · run-rate` with the number under usage, so it is visible both that Fly is missing from the total and why.

Home's **Month-end spend** tile names the same exclusions, so the two surfaces that carry a headline total cannot disagree about what that total covers. A provider whose newest snapshot belongs to an earlier month is reported as stale rather than counted: a figure recorded for last month is evidence about last month, and carrying it silently into this month's total would restate a stale number as a current one.

The daily cost chart discloses the same detail per point: the date, the day's total, each provider's contribution with its accounting basis, and the providers excluded from that total, with the projected end point broken down the same way. A single summed line cannot say which provider moved, nor whether a day is missing a provider entirely.

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

Collect the Fly compute run-rate and Machine census as usage evidence (requires
`flyctl auth login` on the machine running the collector):

```bash
FLY_COST_MODE=flyctl pnpm turbo run ops:sync --filter=@zapengine/control-center --env-mode=loose
```

The daily GitHub Actions workflow sets `FLY_COST_MODE=flyctl` and uses the
official Fly CLI setup action. Local manual runs use the explicit command above.
A `flyctl` failure is reported as a provider error and fails the run even when an
already-recorded Fly figure is carried forward, so a collector that has quietly
stopped working cannot sit behind a green scheduled job.

Record the billed month-to-date figure shown on the Fly dashboard. It is the
only value permitted to act as Fly's accrued and projected spend:

```bash
pnpm ops:cost snapshot fly 18.43
```

The figure keeps the "as of" moment it was recorded at, and a later sync
refreshes the run-rate beneath it without touching the amount. It is scoped to
its own month and never carried into the next one, so on the 1st Fly has no cost
until someone records a new figure. Because the amount is a month-to-date
reading rather than a forecast, recording it again later in the month is what
makes the projection accurate: a figure read on the 28th is nearly the whole
month, one read on the 2nd is barely a floor.

Two wrinkles when recording after the day's sync has already run:

- The CLI replaces that day's snapshot row, which clears the
  `compute_run_rate_monthly` usage until the next sync merges the two back
  together. The recorded amount is the load-bearing part and survives; the
  run-rate returns on its own.
- The `usage_run_rate_usd` metric series drops by roughly `$67` on the first
  sync after this change, because Fly's run-rate is no longer reported as cost.
  The spend statement's 7-day delta will therefore show a large apparent saving
  for a week. That is the correction landing, not money saved.

Fly rows written by the old collector are still in `ops.cost_snapshots` with
`projected_cost_usd = 67.70` and `source = 'api'`, and nothing rewrites them. In
`flyctl` mode the next daily sync writes a fresh run-rate-only row and the
dashboard moves on by itself, but the old rows stay in the monthly history. No
migration ships with this change; neutralising them is optional, affects stored
history only, and is one statement. The `source` filter is the load-bearing part
of it: operator-recorded rows are written as `manual` and must survive.

```sql
update ops.cost_snapshots set projected_cost_usd = null where provider = 'fly' and source = 'api';
```

Record a real invoice / charge separately. `cost_transactions` answers what was
actually paid, not what the month is expected to cost:

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
