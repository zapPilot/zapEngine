See @README.md for product overview and run commands, @MCP.md for the
agent-facing operations API, and @OPERATOR.md for the bounded operator
runbook.

# Gotchas

- **Production ops reads require the production Infisical environment.** When
  running Control Center / ops commands directly from a shell, use
  `infisical run --env=prod -- pnpm ops --status --json` (and the analogous
  prefix for other direct ops commands). A bare local `pnpm ops --status` can
  run without the production provider credentials and make Fly, Sentry,
  PostHog, or backlog access appear `unconfigured`; do not treat that result as
  production truth. The repository MCP launcher already selects prod itself via
  `scripts/env/run.mjs --environment prod`.
- **This is a read-only, lifecycle-independent UI.** A dashboard port failure
  must never stop publishing, metrics, or ingest — keep it that way. The one
  exception is the nightly `ops:sync` cron (`src/server/sync.ts`), which
  persists cost and metric snapshots.
- **The sync fails closed, the dashboard degrades open.** `sync.ts` exits
  non-zero on any provider `error`, but the dashboard renders per-provider
  `unconfigured` states instead. A collector that structurally cannot measure
  (see `UsageNotMeasurableError` in `@zapengine/cost-observability`) must map
  to `unconfigured`/`skipped`, never `error` — a permanently red nightly job
  hides the next genuinely broken provider.
- **PostgREST rejections are plain objects, not `Error`s.** Always format
  handler error messages with `postgrestErrorMessage` from
  `./services/supabase.js`; a bare `instanceof Error` ternary drops the real
  message (or prints `[object Object]` via `String(error)`).
- **Statements are composed in one place.** `src/server/services/statements/build.ts`
  wires rule findings into the five narrative domains; `headers` must stay
  exhaustive over `STATEMENT_DOMAINS` (the builder throws otherwise). Adding a
  rule means composing it here with fired/not-fired tests, not just exporting
  it from `rules.ts`.
- **Keep knip's `entry` narrow.** `knip.ts` lists only roots knip cannot
  derive; widening `entry` toward `project` silently disables unused-file and
  unused-export detection for the whole workspace.
- **Run workspace tasks through Turbo** (`pnpm turbo run <task>
--filter=@zapengine/control-center`) so internal package builds resolve
  before type-check, lint, or tests.
