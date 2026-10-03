import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';

import * as Sentry from '@sentry/node';

export interface DbEvidenceConfig {
  url: string;
  key: string;
  schema: string;
  directory: string;
}

export function readDbEvidenceConfig(env = process.env): DbEvidenceConfig {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value)
      throw new Error(`Missing required environment variable: ${name}`);
    return value;
  };
  const url = new URL(required('SUPABASE_URL'));
  if (url.protocol !== 'https:') throw new Error('SUPABASE_URL must use HTTPS');
  return {
    url: url.origin,
    key: required('SUPABASE_SERVICE_ROLE_KEY'),
    schema: required('SUPABASE_DB_SCHEMA'),
    directory: join(homedir(), '.zapengine', 'db-evidence'),
  };
}

export interface DbEvidenceDependencies {
  fetch?: typeof fetch;
  now?: () => Date;
  report?: (snapshot: Record<string, unknown>) => void;
}

function metricPriority(line: string): number {
  if (line.startsWith('node_memory_')) return 0;
  if (line.startsWith('node_vmstat_pswp')) return 1;
  if (line.startsWith('node_disk_')) return 2;
  if (line.includes('mode="iowait"')) return 3;
  return 4;
}

/** Never retain HTTP error bodies: providers may echo credentials or SQL. */
async function capture(
  request: () => Promise<Response>,
  text: boolean,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const response = await request();
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    // Response bodies are bounded too; a broken endpoint cannot fill RAM/disk.
    const reader = response.body?.getReader();
    if (!reader) return { ok: false, error: 'Empty response body' };
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > 4 * 1024 * 1024) {
        await reader.cancel();
        return { ok: false, error: 'Response exceeds 4 MiB limit' };
      }
      chunks.push(item.value);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    return { ok: true, data: text ? body : JSON.parse(body) };
  } catch {
    return {
      ok: false,
      error: 'Request failed, timed out, or returned invalid data',
    };
  }
}

async function prune(directory: string, now: number): Promise<void> {
  const files = await Promise.all(
    (await readdir(directory))
      .filter((name) => /^\d{4}-.*\.json\.gz$/.test(name))
      .map(async (name) => ({ name, ...(await stat(join(directory, name))) })),
  );
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  let bytes = 0;
  for (const file of files) {
    bytes += file.size;
    if (now - file.mtimeMs > 7 * 86400_000 || bytes > 100 * 1024 * 1024) {
      await unlink(join(directory, file.name));
    }
  }
}

export async function collectDbEvidence(
  config: DbEvidenceConfig,
  deps: DbEvidenceDependencies = {},
) {
  const fetcher = deps.fetch ?? fetch;
  const at = (deps.now ?? (() => new Date()))();
  // Independent deadlines: a wedged SQL endpoint never suppresses host metrics.
  const [metrics, database] = await Promise.all([
    capture(
      () =>
        fetcher(`${config.url}/customer/v1/privileged/metrics`, {
          headers: {
            Authorization: `Basic ${Buffer.from(`service_role:${config.key}`).toString('base64')}`,
          },
          signal: AbortSignal.timeout(10_000),
        }),
      true,
    ),
    capture(
      () =>
        fetcher(`${config.url}/rest/v1/rpc/capture_db_io_evidence`, {
          method: 'POST',
          headers: {
            apikey: config.key,
            Authorization: `Bearer ${config.key}`,
            'Content-Type': 'application/json',
            'Content-Profile': config.schema,
          },
          body: '{}',
          signal: AbortSignal.timeout(10_000),
        }),
      false,
    ),
  ]);
  const evidence = {
    version: 1,
    capturedAt: at.toISOString(),
    project: new URL(config.url).hostname,
    metrics,
    database,
  };
  const hostMetrics =
    typeof metrics.data === 'string'
      ? metrics.data
          .split('\n')
          .filter((line) =>
            /^(node_memory_|node_vmstat_pswp|node_disk_|node_cpu_seconds_total)/.test(
              line,
            ),
          )
          .sort((a, b) => metricPriority(a) - metricPriority(b))
          .slice(0, 120)
      : [];
  const report =
    deps.report ??
    ((snapshot: Record<string, unknown>) => {
      Sentry.logger.info('db_evidence_snapshot', {
        snapshot: JSON.stringify(snapshot),
      });
    });
  // Logs are source-complete and independent of trace sampling / DB availability.
  const safeDatabase =
    database.data && typeof database.data === 'object'
      ? (JSON.parse(
          JSON.stringify(database.data, (key, value: unknown) =>
            key === 'normalized_query' ? undefined : value,
          ),
        ) as unknown)
      : database.data;
  try {
    report({
      ...evidence,
      database: { ...database, data: safeDatabase },
      metrics: { ok: metrics.ok, error: metrics.error, samples: hostMetrics },
    });
  } catch {
    console.error(
      'db-evidence: external log failed; preserving local evidence',
    );
  }
  await mkdir(config.directory, { recursive: true, mode: 0o700 });
  const body = gzipSync(JSON.stringify(evidence));
  const name = `${at.toISOString().replaceAll(':', '-')}.json.gz`;
  await writeFile(join(config.directory, name), body, { mode: 0o600 });
  await prune(config.directory, at.getTime());
  console.log(
    JSON.stringify({
      event: 'db-evidence:snapshot',
      capturedAt: evidence.capturedAt,
      metricsOk: metrics.ok,
      databaseOk: database.ok,
    }),
  );
  return { ...evidence, path: join(config.directory, name) };
}

/** Observational companion only: never gates ingest or social publishing. */
export function createDbEvidenceMonitor(config = readDbEvidenceConfig()) {
  const controller = new AbortController();
  let task: Promise<void> | undefined;
  return {
    start() {
      task ??= runDbEvidenceLoop(config, { signal: controller.signal });
    },
    async stop() {
      controller.abort();
      await task;
    },
  };
}

export async function runDbEvidenceLoop(
  config: DbEvidenceConfig,
  options: DbEvidenceDependencies & { signal: AbortSignal },
) {
  while (!options.signal.aborted) {
    const started = Date.now();
    try {
      await collectDbEvidence(config, options);
    } catch {
      console.error('db-evidence: local capture failed');
    }
    try {
      await delay(Math.max(0, 60_000 - (Date.now() - started)), undefined, {
        signal: options.signal,
      });
    } catch {
      break;
    }
  }
}
