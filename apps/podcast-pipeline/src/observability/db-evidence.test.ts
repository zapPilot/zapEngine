import {
  mkdtemp,
  readFile,
  rm,
  truncate,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  collectDbEvidence,
  createDbEvidenceMonitor,
  readDbEvidenceConfig,
  runDbEvidenceLoop,
} from './db-evidence.js';

const sentry = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('@sentry/node', () => ({ logger: sentry }));
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function config() {
  const directory = await mkdtemp(join(tmpdir(), 'db-evidence-test-'));
  directories.push(directory);
  return {
    url: 'https://project.supabase.co',
    key: 'private-key',
    schema: 'from_fed_to_chain',
    directory,
  };
}

describe('DB evidence capture', () => {
  it('requires canonical HTTPS configuration', () => {
    expect(() => readDbEvidenceConfig({})).toThrow('SUPABASE_URL');
    expect(() =>
      readDbEvidenceConfig({ SUPABASE_URL: 'http://example.test' }),
    ).toThrow('HTTPS');
    expect(() =>
      readDbEvidenceConfig({ SUPABASE_URL: 'https://example.test' }),
    ).toThrow('SUPABASE_SERVICE_ROLE_KEY');
    expect(() =>
      readDbEvidenceConfig({
        SUPABASE_URL: 'https://example.test',
        SUPABASE_SERVICE_ROLE_KEY: 'key',
      }),
    ).toThrow('SUPABASE_DB_SCHEMA');
    expect(
      readDbEvidenceConfig({
        SUPABASE_URL: 'https://example.test/',
        SUPABASE_SERVICE_ROLE_KEY: 'key',
        SUPABASE_DB_SCHEMA: 'from_fed_to_chain',
      }).url,
    ).toBe('https://example.test');
  });

  it('retains metrics when SQL times out, without leaking HTTP error bodies or auth', async () => {
    const settings = await config();
    const report = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          'node_memory_MemAvailable_bytes 123\nnode_vmstat_pswpin 0\nunsafe_label{email="secret"} 1',
        ),
      )
      .mockRejectedValueOnce(new Error('private-key'));
    const result = await collectDbEvidence(settings, {
      fetch: fetcher,
      report,
    });
    const saved = JSON.parse(
      gunzipSync(await readFile(result.path)).toString(),
    );
    expect(saved.metrics.ok).toBe(true);
    expect(saved.database.ok).toBe(false);
    expect(JSON.stringify(saved)).not.toContain('private-key');
    expect(report.mock.calls[0]?.[0].metrics.samples).toEqual([
      'node_memory_MemAvailable_bytes 123',
      'node_vmstat_pswpin 0',
    ]);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: `Basic ${Buffer.from('service_role:private-key').toString('base64')}`,
    });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      'Content-Profile': 'from_fed_to_chain',
    });
  });

  it('archives SQL even when metrics returns 401; preserves zero counters and string IDs', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('secret body', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            queries: [{ queryid: '9223372036854775807', calls: '0' }],
            stats_reset: '2026-10-03',
          }),
        ),
      );
    const result = await collectDbEvidence(await config(), {
      fetch: fetcher,
      report: vi.fn(),
    });
    expect(result.metrics).toEqual({ ok: false, error: 'HTTP 401' });
    expect(result.database.data).toMatchObject({
      queries: [{ queryid: '9223372036854775807', calls: '0' }],
    });
  });

  it('bounds response bodies and records invalid or empty JSON', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('x'.repeat(4 * 1024 * 1024 + 1)))
      .mockResolvedValueOnce(new Response(null));
    const result = await collectDbEvidence(await config(), {
      fetch: fetcher,
      report: vi.fn(),
    });
    expect(result.metrics.error).toContain('limit');
    expect(result.database.error).toBe('Empty response body');
    const invalid = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not JSON'));
    expect(
      (
        await collectDbEvidence(await config(), {
          fetch: invalid,
          report: vi.fn(),
        })
      ).database.ok,
    ).toBe(false);
  });

  it('removes expired snapshots while leaving unrelated files intact', async () => {
    const settings = await config();
    const expired = join(settings.directory, '2020-01-01.json.gz');
    await writeFile(expired, 'old');
    await utimes(expired, new Date(0), new Date(0));
    await writeFile(join(settings.directory, 'keep.txt'), 'unrelated');
    await collectDbEvidence(settings, {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('{}')),
      report: vi.fn(),
    });
    await expect(readFile(expired)).rejects.toThrow();
    expect(await readFile(join(settings.directory, 'keep.txt'), 'utf8')).toBe(
      'unrelated',
    );
  });

  it('preserves query mapping privately but strips normalized SQL from external logs', async () => {
    const snapshot = {
      queries: [
        {
          queryid: '123',
          fingerprint: 'hash',
          normalized_query: 'select private_literal from table',
          calls: '42',
        },
      ],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('node_memory_MemFree_bytes 0'))
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot)));
    const report = vi.fn();
    const result = await collectDbEvidence(await config(), {
      fetch: fetcher,
      report,
    });
    expect(JSON.stringify(report.mock.calls)).not.toContain('private_literal');
    expect(JSON.stringify(report.mock.calls)).toContain('hash');
    expect(gunzipSync(await readFile(result.path)).toString()).toContain(
      'private_literal',
    );
  });

  it('retains local evidence even when the external sink throws', async () => {
    const result = await collectDbEvidence(await config(), {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('{}')),
      report: () => {
        throw new Error('sink down');
      },
    });
    expect((await readFile(result.path)).length).toBeGreaterThan(0);
  });

  it('runs no overlapping captures and exits on abort', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    const report = vi.fn(() => controller.abort());
    await runDbEvidenceLoop(await config(), {
      signal: controller.signal,
      fetch: fetcher,
      report,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledTimes(1);
    await runDbEvidenceLoop(await config(), {
      signal: controller.signal,
      fetch: fetcher,
      report,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('caps local bytes and sends the default Sentry log', async () => {
    const settings = await config();
    const large = join(settings.directory, '2026-01-01.json.gz');
    await writeFile(large, '');
    await truncate(large, 100 * 1024 * 1024 + 1);
    const log = sentry.info;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}')),
    );
    const result = await collectDbEvidence(settings, { now: () => new Date() });
    expect(log).toHaveBeenCalledWith(
      'db_evidence_snapshot',
      expect.any(Object),
    );
    await expect(readFile(large)).rejects.toThrow();
    expect(result.metrics.ok).toBe(true);
  });

  it('starts a single background task and drains its bounded capture on stop', async () => {
    const settings = await config();
    vi.stubEnv('SUPABASE_URL', settings.url);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', settings.key);
    vi.stubEnv('SUPABASE_DB_SCHEMA', settings.schema);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}')),
    );
    sentry.info.mockClear();
    const stopped = createDbEvidenceMonitor();
    await stopped.stop();
    stopped.start();
    await stopped.stop();
    const running = createDbEvidenceMonitor(settings);
    running.start();
    running.start();
    await running.stop();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('isolates local storage failure from the loop', async () => {
    const settings = await config();
    const path = join(settings.directory, 'regular-file');
    await writeFile(path, 'cannot mkdir this');
    const controller = new AbortController();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runDbEvidenceLoop(
      { ...settings, directory: path },
      {
        signal: controller.signal,
        fetch: vi
          .fn<typeof fetch>()
          .mockImplementation(async () => new Response('{}')),
        report: () => controller.abort(),
      },
    );
    expect(error).toHaveBeenCalledWith('db-evidence: local capture failed');
  });

  it('prioritizes memory, swapping and disk before CPU in a bounded remote projection', async () => {
    const report = vi.fn();
    const lines = [
      'node_cpu_seconds_total{mode="user"} 2',
      'node_cpu_seconds_total{mode="iowait"} 1',
      'node_disk_read_bytes_total 3',
      'node_vmstat_pswpout 4',
      'node_memory_MemAvailable_bytes 5',
    ];
    await collectDbEvidence(await config(), {
      fetch: vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response(lines.join('\n'))),
      report,
    });
    expect(report.mock.calls[0]?.[0].metrics.samples).toEqual(
      [...lines].reverse(),
    );
  });
});
