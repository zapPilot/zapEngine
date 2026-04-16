# ADR 0001: In-Memory Job Queue

## Status

Accepted

## Context

`ETLJobQueue` currently coordinates webhook and manual ETL jobs inside the API process. It stores queued jobs and results in memory, persists wallet-onboarding status snapshots for polling, and refreshes materialized views after successful writes.

This queue is intentionally simple. The current system needs predictable FIFO-style execution and straightforward operational behavior more than it needs concurrent workers or durable broker-backed delivery.

## Decision

Keep the queue in memory and process one job at a time.

## Guarantees

- Jobs are processed sequentially.
- Pending jobs are selected in FIFO order.
- Results remain available only for the lifetime of the process.
- Wallet-onboarding status persistence remains best-effort and non-fatal.
- Materialized view refreshes remain part of the end-to-end job lifecycle.

## Non-Goals

- Durable queue storage across restarts.
- Priority scheduling.
- Worker pool concurrency.
- Cross-process coordination.

## Notes

If queue durability or throughput becomes a product requirement, replace the current implementation with a dedicated broker-backed design instead of incrementally layering persistence onto the in-memory queue.
