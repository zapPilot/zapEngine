# Schedule registry

`.github/schedules.json` is the canonical inventory of scheduled and long-running work. Register a job when its trigger is a GitHub Actions cron, an external scheduler, a database scheduler, a deployed process loop, an operator-Mac daemon, or an Electron loop.

## Field contract

- `name`: stable, unique identifier.
- `purpose`: concise operational outcome.
- `schedule_kind`: `cron`, `interval`, or `continuous`.
- `schedule`: the cron expression or code-defined cadence; continuous processes use `process lifetime`.
- `schedule_source`: `workflow` for checked-in GitHub Actions cron, `code` for a checked-in loop, or `external` for a claim about configuration outside the repository.
- `runtime`: `github-actions`, `pipedream`, `pg_cron`, `fly-process`, `local-mac`, or `electron`.
- `workspace`: repository workspace responsible for the work.
- `entrypoint`: existing repository path that implements or receives the work.
- `endpoint`: optional HTTP endpoint invoked by the scheduler.
- `docs`: optional existing operational document.

The trust order is `workflow`, then `code`, then `external`. A workflow row is mechanically compared with its YAML cron. A code row points to the implementation that owns its cadence. An external row records a verified inventory claim, but repository CI cannot observe later changes in that provider.

## Validation

Run:

```bash
pnpm lint schedules
```

The check validates JSON structure, required fields, enum values, unique names, and all `entrypoint` and `docs` paths. It also compares GitHub Actions cron schedules bidirectionally: every workflow cron must have one matching registry row, and every workflow-sourced registry row must exist in YAML.

The check does not contact Pipedream, Fly, a production database, an operator Mac, or a running Electron application. It prints the number of external claims it cannot verify. Re-inventory an external scheduler in its own control plane before changing its row.

## Recovery by runtime

- GitHub Actions: inspect the workflow run and dispatch the same workflow manually after correcting credentials or transient failures.
- Pipedream: inspect the workflow execution and its configured notification, then retry the unchanged HTTP trigger. Do not change or disable the workflow without an approved scheduler migration.
- `pg_cron`: inspect `cron.job` and job-run details in the linked database. Apply schedule changes only through a root Supabase migration.
- Fly process: inspect application logs and machine state. Restart the affected process only after checking whether its work is safe to repeat.
- Local Mac: restore the documented login/session prerequisites, acquire the daemon lock, and restart the repository command.
- Electron: inspect desktop logs and restart the application; the loop resumes with the signed-in session.
