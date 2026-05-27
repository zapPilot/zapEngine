See @../../../CLAUDE.md for app-level conventions.

# jobs (module)

Async work queue and scheduled processors for account-engine. Drives weekly email reports, drift-alert checks, wallet refreshes, and other periodic tasks.

## Layout

```
jobs/
├── job-processor.service.ts   # Worker loop — picks up jobs, runs them, records state
├── job-queue.service.ts       # Queue API — enqueue, lease, ack, fail
├── processors/                # One file per job type — pure handler functions
├── interfaces/                # TS interfaces for jobs, payloads, and run results
└── utils/                     # Retry helpers, backoff, time helpers
```

## How a job works

1. Some route / scheduler enqueues a job via `job-queue.service.ts.enqueue({ type, payload })`.
2. `job-processor.service.ts` polls the queue, leases a job, and dispatches by `type` to the handler in `processors/`.
3. The handler returns success or throws. The processor records result, retries (with backoff) on failure, or moves to dead-letter after N attempts.

## Adding a new job type

1. Add a payload interface in `interfaces/` (`XxxJobPayload`).
2. Add a handler file in `processors/` exporting `processXxx(payload: XxxJobPayload): Promise<void>`.
3. Register the handler in the dispatch map (search for the existing `case 'wallet-refresh'`-style switch).
4. Enqueue from your route with `enqueue({ type: 'xxx', payload })`.

## Conventions

- Handlers must be **idempotent** — they may be re-run on retry.
- Throw to fail; resolve to succeed. Don't return error objects.
- Handlers can `await` notifications (`modules/notifications/`) but should not enqueue more jobs synchronously — return success first.
- Wall-clock time goes through `utils/` helpers, not `Date.now()`, so tests can fake it.

## Gotchas

- Failed jobs go to dead-letter after retry budget — check `job_runs` table + admin Telegram alert (`admin-notification.service.ts`).
- Long-running jobs (>1 min) need to heartbeat by extending their lease via `job-queue.service.ts.extendLease()` — otherwise the processor will assume crash and re-lease.
- DST / TZ: weekly schedules are in UTC; localising to user TZ happens in the handler, not the scheduler.
