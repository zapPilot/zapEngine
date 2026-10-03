import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';

import * as Sentry from '@sentry/node';

interface EnqueueCounts {
  attempts: number;
  inserted: number;
  duplicates: number;
  errors: number;
}

interface TickSummary extends EnqueueCounts {
  event: 'social_daemon_tick';
  tickId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  outcome: 'success' | 'error';
  owner: string;
  host: string;
  pid: number;
  release: string;
  errorType?: string;
}

interface TickTelemetryOptions {
  now: Date;
  owner: string;
  log?: (message: string) => void;
  directory?: string;
}

const counts = new AsyncLocalStorage<EnqueueCounts>();
const RETENTION_DAYS = 30;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_DIRECTORY = join(
  homedir(),
  '.zap-pilot',
  'observability',
  'social-daemon',
);

/** Every completed request counts, including successful ignore-duplicate inserts. */
export function recordSocialEnqueueResult(
  outcome: 'inserted' | 'duplicate' | 'error',
): void {
  const current = counts.getStore();
  if (!current) return;
  current.attempts += 1;
  if (outcome === 'inserted') current.inserted += 1;
  else if (outcome === 'duplicate') current.duplicates += 1;
  else current.errors += 1;
}

/**
 * One unsampled terminal record per tick, even when discovery or publishing
 * throws. The local sink survives a DB outage and the Sentry sink survives a
 * laptop loss. Neither sink can change release behavior or mask its exception.
 * No query text, episode content, credentials, or raw error messages are stored.
 */
export async function withSocialDaemonTickTelemetry<T>(
  options: TickTelemetryOptions,
  run: () => Promise<T>,
): Promise<T> {
  const counters: EnqueueCounts = {
    attempts: 0,
    inserted: 0,
    duplicates: 0,
    errors: 0,
  };
  const started = performance.now();
  const base = {
    event: 'social_daemon_tick' as const,
    tickId: randomUUID(),
    startedAt: options.now.toISOString(),
    owner: options.owner,
    host: hostname(),
    pid: process.pid,
    release: process.env['APP_COMMIT_SHA'] ?? 'unknown',
  };
  return counts.run(counters, async () => {
    let outcome: TickSummary['outcome'] = 'success';
    let errorType: string | undefined;
    try {
      return await run();
    } catch (error) {
      outcome = 'error';
      errorType = error instanceof Error ? error.name.slice(0, 100) : 'unknown';
      throw error;
    } finally {
      const summary: TickSummary = {
        ...base,
        ...counters,
        outcome,
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
        ...(errorType ? { errorType } : {}),
      };
      await persistSummary(summary, options);
    }
  });
}

async function persistSummary(
  summary: TickSummary,
  options: TickTelemetryOptions,
): Promise<void> {
  const log = options.log ?? console.log;
  // Keep each sink independent: failed filesystem writes must still reach Sentry.
  try {
    await appendSummary(summary, options.directory ?? DEFAULT_DIRECTORY);
  } catch {
    warn(log, 'local');
  }
  try {
    Sentry.logger.info('social_daemon_tick', { ...summary });
  } catch {
    warn(log, 'Sentry');
  }
}

async function appendSummary(
  summary: TickSummary,
  directory: string,
): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const day = summary.completedAt.slice(0, 10);
  const path = join(directory, `ticks-${day}.jsonl`);
  const size = await stat(path).then(
    (file) => file.size,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return 0;
      throw error;
    },
  );
  if (size >= MAX_FILE_BYTES) {
    await rename(path, `${path}.1`);
  }
  const file = await open(path, 'a', 0o600);
  try {
    await file.writeFile(`${JSON.stringify(summary)}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
  const cutoff = Date.parse(`${day}T00:00:00Z`) - RETENTION_DAYS * 86_400_000;
  for (const entry of await readdir(directory)) {
    const match = /^ticks-(\d{4}-\d{2}-\d{2})\.jsonl(?:\.1)?$/.exec(entry);
    if (match?.[1] && Date.parse(`${match[1]}T00:00:00Z`) <= cutoff) {
      await rm(join(directory, entry), { force: true });
    }
  }
}

function warn(log: (message: string) => void, sink: string): void {
  try {
    log(`⚠️ [social-daemon] tick telemetry ${sink} write failed`);
  } catch {
    // Even a caller-supplied logger must not replace the publishing outcome.
  }
}
