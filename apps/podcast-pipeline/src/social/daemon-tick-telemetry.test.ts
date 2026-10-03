import * as fsPromises from 'node:fs/promises';
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, mkdir: vi.fn(original.mkdir) };
});
vi.mock('@sentry/node', () => ({ logger: { info: sentry.info } }));

import {
  recordSocialEnqueueResult,
  withSocialDaemonTickTelemetry,
} from './daemon-tick-telemetry.js';

let directory: string;
const tick = (run: () => Promise<unknown>, extra = {}) =>
  withSocialDaemonTickTelemetry(
    { now: new Date(), owner: 'test-owner', directory, ...extra },
    run,
  );

async function saved() {
  const entries = (await readdir(directory)).filter((name) =>
    name.endsWith('.jsonl'),
  );
  const lines = await Promise.all(
    entries.map((name) => readFile(join(directory, name), 'utf8')),
  );
  return lines.flatMap((text) =>
    text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
  );
}

describe('social daemon evidence independent of Supabase', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    directory = await mkdtemp(join(tmpdir(), 'social-tick-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('persists exact unsampled counts and sends the same structured Sentry log', async () => {
    recordSocialEnqueueResult('inserted'); // Outside a tick cannot pollute it.
    await expect(
      tick(async () => {
        recordSocialEnqueueResult('inserted');
        recordSocialEnqueueResult('duplicate');
        recordSocialEnqueueResult('duplicate');
        recordSocialEnqueueResult('error');
        return 'released';
      }),
    ).resolves.toBe('released');
    const [summary] = await saved();
    expect(summary).toMatchObject({
      event: 'social_daemon_tick',
      attempts: 4,
      inserted: 1,
      duplicates: 2,
      errors: 1,
      outcome: 'success',
      owner: 'test-owner',
    });
    expect(sentry.info).toHaveBeenCalledExactlyOnceWith(
      'social_daemon_tick',
      summary,
    );
    const file = (await readdir(directory))[0]!;
    expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);
  });

  it('captures a zero-work tick and isolates overlapping tick counters', async () => {
    await Promise.all([
      tick(async () => {
        await Promise.resolve();
        recordSocialEnqueueResult('duplicate');
      }),
      tick(async () => {}),
    ]);
    expect((await saved()).map((row) => row.attempts).sort()).toEqual([0, 1]);
  });

  it('leaves the original release exception intact and excludes its private message', async () => {
    const error = new TypeError('secret query token=private');
    await expect(
      tick(async () => {
        recordSocialEnqueueResult('error');
        throw error;
      }),
    ).rejects.toBe(error);
    const [summary] = await saved();
    expect(summary).toMatchObject({ outcome: 'error', errorType: 'TypeError' });
    expect(JSON.stringify(summary)).not.toContain('private');
  });

  it('captures non-Error failures without serializing them', async () => {
    await expect(
      tick(async () => {
        throw JSON.parse('"private"');
      }),
    ).rejects.toBe('private');
    expect((await saved())[0]).toMatchObject({ errorType: 'unknown' });
  });

  it('continues the external sink on local filesystem failure', async () => {
    const badPath = join(directory, 'file');
    await writeFile(badPath, 'not a directory');
    const log = vi.fn();
    await expect(
      tick(async () => 1, { directory: badPath, log }),
    ).resolves.toBe(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('local write failed'),
    );
    expect(sentry.info).toHaveBeenCalledOnce();
  });

  it('keeps local evidence and original result if Sentry and warning logger throw', async () => {
    sentry.info.mockImplementation(() => {
      throw new Error('offline');
    });
    await expect(
      tick(async () => 2, {
        log: () => {
          throw new Error('logger');
        },
      }),
    ).resolves.toBe(2);
    expect(await saved()).toHaveLength(1);
  });

  it('warns safely on inaccessible default evidence location', async () => {
    const mkdir = vi
      .mocked(fsPromises.mkdir)
      .mockRejectedValueOnce(new Error('read-only'));
    const log = vi.fn();
    try {
      await expect(
        withSocialDaemonTickTelemetry(
          { now: new Date(), owner: 'test', log },
          async () => 3,
        ),
      ).resolves.toBe(3);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('local write failed'),
      );
      expect(sentry.info).toHaveBeenCalledOnce();
    } finally {
      mkdir.mockRestore();
    }
  });

  it('does not hide stat failures other than a missing file', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const path = join(directory, `ticks-${day}.jsonl`);
    await symlink(path, path);
    const log = vi.fn();
    await expect(tick(async () => 4, { log })).resolves.toBe(4);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('local write failed'),
    );
    expect(sentry.info).toHaveBeenCalledOnce();
  });

  it('rotates bounded daily files and prunes only old owned evidence', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const path = join(directory, `ticks-${day}.jsonl`);
    await writeFile(path, 'x'.repeat(5 * 1024 * 1024));
    await writeFile(`${path}.1`, 'previous rotation');
    await writeFile(join(directory, 'ticks-2000-01-01.jsonl'), 'old');
    await writeFile(join(directory, 'ticks-2000-01-01.jsonl.1'), 'old');
    await writeFile(join(directory, 'keep-me.txt'), 'unrelated');
    await tick(async () => {});
    expect(await readdir(directory)).toEqual(
      expect.arrayContaining([
        `ticks-${day}.jsonl`,
        `ticks-${day}.jsonl.1`,
        'keep-me.txt',
      ]),
    );
    expect(
      (await readdir(directory)).some((name) => name.includes('2000')),
    ).toBe(false);
    expect((await stat(`${path}.1`)).size).toBe(5 * 1024 * 1024);
    expect(await saved()).toHaveLength(1);
  });
});
