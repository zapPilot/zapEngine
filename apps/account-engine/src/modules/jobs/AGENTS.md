See @../../../AGENTS.md for app-level conventions.

# Jobs module

In-memory async work queue and processors for weekly reports and strategy-change notifications.

## Flow

1. A route creates a job with `jobQueueService.createJob(...)`.
2. `job-processor.service.ts` polls the in-process queue and dispatches to a registered processor.
3. Processors return `JobProcessingResult`; retryable failures are rescheduled with backoff and permanent failures are marked failed.
4. Weekly-report batch jobs fan out into single-user child jobs; `GET /jobs/:jobId` derives parent status from the children.
5. `STRATEGY_CHANGE_BATCH` deliberately does not fan out — it broadcasts one strategy-wide message, so there is nothing per-user to compute.

## Invariants

- Processors must be idempotent because retries can execute them again.
- Return `{ success: false, error }` or `createJobFailureResult`; never swallow errors as successful results.
- Keep status transitions and job logs in `JobQueueService`.
- Register new processors in `container.ts`; add job types and payloads in `interfaces/job.interface.ts`.

## Operational gotchas

- Jobs, child relationships, and logs are process-memory only. There is no durable `job_runs`, leasing, or dead-letter storage.
- Restarts, deploys, crashes, auto-stop, or requests hitting another machine can lose a job or make `GET /jobs/:jobId` return 404.
- Permanent failures handled by `JobProcessorService` send fire-and-forget email through `AdminNotificationService`; they are not Telegram alerts.
- Cleanup force-fails stale in-memory jobs but does not invoke the normal admin failure notification.
- Keep the external Pipedream weekly-report completion watchdog until queue/status storage becomes durable across restarts and machines.
