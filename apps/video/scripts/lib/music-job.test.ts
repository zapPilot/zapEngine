import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { musicOptions, reserveSong, runMusic } from './music-job';

it('bounds take counts and the shared generation budget', () => {
  expect(musicOptions()).toEqual({ takes: 2 });
  expect(musicOptions('6')).toEqual({ takes: 6 });
  for (const n of ['0', '7', '1.5', 'x'])
    expect(() => musicOptions(n)).toThrow();
  expect(reserveSong(0)).toBe(1);
  expect(reserveSong(11)).toBe(12);
  for (const n of [-1, 0.5, 12, NaN])
    expect(() => reserveSong(n)).toThrow('$1');
});
it('requires credentials without dispatching or reserving', async () => {
  const generate = vi.fn();
  await expect(
    runMusic(
      {
        id: 'gentle-88',
        prompt: 'instrumental',
        root: path.join(import.meta.dirname, 'missing-auth-fixture'),
        options: { takes: 1 },
      },
      generate,
    ),
  ).rejects.toThrow('API_KEY');
  expect(generate).not.toHaveBeenCalled();
});
it('persists source takes and requests with a shared ledger, keeping prior takes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'music-source-'));
  const generate = vi.fn().mockResolvedValue(Buffer.from('music'));
  const job = {
    id: 'gentle-88',
    prompt: 'instrumental',
    root,
    options: { takes: 2 },
    apiKey: 'test',
  };
  try {
    expect(await runMusic(job, generate)).toContain('loop cut');
    await runMusic({ ...job, options: { takes: 1 } }, generate);
    expect(
      JSON.parse(await readFile(path.join(root, 'music-budget.json'), 'utf8')),
    ).toEqual({ attempts: 3, reservedUsd: 0.24 });
    expect(
      await readFile(path.join(root, 'gentle-88/music/take-3.raw.mp3'), 'utf8'),
    ).toBe('music');
    expect(
      JSON.parse(
        await readFile(
          path.join(root, 'gentle-88/music/take-1.request.json'),
          'utf8',
        ),
      ).prompt,
    ).toBe('instrumental');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('stops on the first provider error, charges the attempt and never substitutes a provider', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'music-source-'));
  const generate = vi.fn().mockRejectedValue(new Error('provider failure'));
  try {
    await expect(
      runMusic(
        {
          id: 'drive-112',
          prompt: 'instrumental',
          root,
          options: { takes: 2 },
          apiKey: 'test',
        },
        generate,
      ),
    ).rejects.toThrow('provider failure');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(await readFile(path.join(root, 'music-budget.json'), 'utf8'))
        .attempts,
    ).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('does not dispatch when the ledger is exhausted or another process holds the lock', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'music-source-'));
  const generate = vi.fn();
  const job = {
    id: 'drive-112',
    prompt: 'instrumental',
    root,
    options: { takes: 1 },
    apiKey: 'test',
  };
  try {
    await writeFile(
      path.join(root, 'music-budget.json'),
      JSON.stringify({ attempts: 12 }),
    );
    await expect(runMusic(job, generate)).rejects.toThrow('$1');
    await mkdir(path.join(root, 'drive-112/music'), { recursive: true });
    await writeFile(path.join(root, 'music-budget.lock'), 'locked');
    await expect(runMusic(job, generate)).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
