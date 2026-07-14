See @../../../CLAUDE.md for app-level conventions.

# jobs (module)

In-memory async work queue and processors for account-engine. It currently
drives weekly email reports and daily suggestions.

## Layout

```
jobs/
├── job-processor.service.ts   # Worker loop — picks up and runs jobs
├── job-queue.service.ts       # In-memory queue, status, logs, retries, cleanup
├── processors/                # Weekly-report and daily-suggestion processors
├── interfaces/                # Job types, payloads, and run results
└── utils/                     # Batch fan-out helpers
```

## How a job works

1. A route creates a job with `jobQueueService.createJob(...)`.
2. `job-processor.service.ts` polls the in-process queue and dispatches the job
   to a registered processor.
3. The processor returns a `JobProcessingResult`. Successful jobs complete;
   retryable failures are rescheduled with backoff; permanent failures are
   marked failed and trigger an admin email.
4. Batch jobs fan out into single-user child jobs. `GET /jobs/:jobId`
   calculates the parent status from those children.

## Adding a new job type

1. Add the job type and payload interface in `interfaces/job.interface.ts`.
2. Add or extend a processor in `processors/` and include the type in its
   `supportedJobTypes`.
3. Register the processor in `container.ts`.
4. Create the job from a route with `jobQueueService.createJob(...)`.

## Conventions

- Processors must be **idempotent** because retryable failures can run again.
- Return `{ success: false, error }` (or use `createJobFailureResult`) to fail;
  do not swallow errors as successful results.
- Batch processors may synchronously create child jobs through
  `BatchFanoutHelper`; the worker processes those children asynchronously.
- Keep status transitions and job logs in `JobQueueService`.

## Gotchas

- Jobs, child relationships, and logs live only in process memory. There is no
  `job_runs` persistence, leasing, or dead-letter table for this module.
- A restart, Fly auto-stop, deployment, process crash, or request routed to a
  different machine can make `GET /jobs/:jobId` return 404. The job may also be
  lost without reaching the normal permanent-failure path.
- Permanent failures handled by `JobProcessorService` send a fire-and-forget
  **email** through `AdminNotificationService`; they do not send Telegram
  alerts. Delivery additionally depends on the email configuration.
- Cleanup force-fails stale non-terminal jobs in memory but does not currently
  invoke the admin failure notification.
- Keep the external Pipedream weekly-report watchdog until queue and status
  storage are durable across restarts and machines. Its 404/timeout alerts
  cover failure modes that the in-process email path cannot observe.
