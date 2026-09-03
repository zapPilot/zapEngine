# Control Center

The Control Center is Zap Pilot's operator-facing command surface. It turns the
existing operational signals into a compact founder view without creating a
second source of truth.

Run it locally from the repository root:

```bash
pnpm ops:dashboard
```

The public command resolves the committed development environment plus Infisical
secrets before starting the dashboard. `pnpm ops` performs that resolution once
for the full operator stack and then starts the dashboard through the internal
raw launcher.

## Information architecture

Six views, each answering one question. Home is a decision surface; the other
five are where its evidence or narrow operator actions live.

| View            | Question it answers                                                         | Reads / actions                                                  |
| --------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Home**        | What needs a decision right now?                                            | `/api/overview`, `/api/costs/history`, `/api/operations`         |
| **Pipeline**    | Where is each article, what failed, and can its current phase be recovered? | `/api/podcast-pipeline` + explicit ingest/video recovery actions |
| **Growth**      | What should we publish next, and what did the last posts do?                | `/api/social-performance`                                        |
| **Product**     | Who do we serve, and is their data still current?                           | `/api/customers` + product health from `/api/overview`           |
| **Reliability** | Which sources are telling us something is wrong?                            | `/api/operations`, `/api/operations/social`                      |
| **Economics**   | What does the company spend, and which provider spends it?                  | `/api/overview`, `/api/costs/history`                            |

Home opens on priority-sorted founder statements rather than on a metric grid.
Each statement carries its conclusion and evidence; the Reliability statement can
disclose the bounded action queue when operator action is warranted. The KPI band
sits below the statements, grouped by concern rather than spread across six equal
tiles, and the provider ledger has exactly one home — Economics.

Because operational evidence is part of the first screen, `/api/operations` is
part of the first paint. Its per-source caches absorb the repeat reads; the
podcast pipeline, per-customer ledger, and publish queue stay lazy because none
appears directly on Home.

The Pipeline view derives its state directly from production sources of truth:
`episode_localizations` for script/translation/TTS readiness,
`podcast_ingest_jobs` for current durable ingest work, `ops_pipeline_runs` as the
historical fallback for pre-durable ingest failures, `episode_video_visuals` for
shared visual planning, and `episode_videos` for the three language renders. A
terminal ingest or visual failure is shown as failed even when downstream rows
are absent or queued; the dashboard must never translate that state into a vague
"still processing" message.

The interface is a single dark surface built on `@zapengine/design-tokens`.
There is no light variant: the tokens are authored dark-first and the product
has no light expression to match. Colours in `src/client/styles.css` are aliases
of those tokens — `healthy` is `--success`, `degraded` is `--warning`,
`critical` is `--error`, and `unknown` is `--ink-faint`, deliberately grey
rather than green.

## Vercel deployment

The Vercel deployment is a remote Control Center operator surface. Configure the project root as `apps/control-center` and enable Vercel Authentication for all deployments before adding credentials or performing the first deployment.

Dashboard HTTP views are generally read-only, with three narrowly bounded mutation surfaces:

- `/api/mcp` exposes the separately authenticated Ops MCP. Its only current write capability is the narrowly allowlisted single-issue Sentry resolve operation documented in [`MCP.md`](./MCP.md).
- `POST /api/podcast-pipeline/:episodeId/ingest/retry` invokes a service-role-only resumable ingest RPC. It only requeues durable work, preserves completed localization checkpoints, rejects a retry while a live ingest lease exists, and creates no Telegram notification target for operator-only recovery jobs.
- `POST /api/podcast-pipeline/:episodeId/video/retry` invokes a service-role-only RPC that resets visual planning and localized video-render state only. It never rewrites scripts, translation, narration, classroom audio, or arbitrary database rows, and it rejects a retry while a live render lease exists. Vercel Authentication is therefore a load-bearing boundary for these operator actions.

The remote API deliberately does not register `POST /api/costs/sync`; cost collection remains an external operation.

Fly operational signals use the Fly Machines HTTP API and require
`FLY_OPS_TOKEN`; they do not depend on `flyctl` being installed in Vercel.

The remote server uses these environment variables as applicable to its read
paths and bounded MCP remediation path:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA`
- `FLY_OPS_TOKEN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG_SLUG`
- `POSTHOG_PERSONAL_API_KEY`
- `POSTHOG_PROJECT_ID`
- `OPENROUTER_API_KEY`
- `OPS_MCP_TOKEN`

The deployment must remain behind Vercel Authentication. Do not treat the
service-role key or Ops MCP token as a replacement for the deployment-level
operator boundary.
