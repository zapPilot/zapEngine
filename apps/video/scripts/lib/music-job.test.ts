import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { storyboard } from '../../src/videos/calculator-pitch/storyboard';
import { musicOptions, musicReadme, reserveSong, runMusic } from './music-job';
import { MUSIC_MODEL } from './openrouter-music';
import { publicDir as realPublicDir } from './paths';

const good = {
  durationSeconds: 70,
  leadingSilenceSeconds: 0,
  loudness: { i: -18, tp: -3, lra: 3, thresh: -28, offset: 0 },
};
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'music-job-'));
  dirs.push(dir);
  return {
    storyboard,
    seconds: 53,
    root: path.join(dir, 'out'),
    publicDir: path.join(dir, 'public'),
    knownIds: [storyboard.id, 'other'],
    options: musicOptions(),
    apiKey: 'test-key',
  };
}
function ops() {
  return {
    generate: vi.fn().mockResolvedValue(Buffer.from('raw')),
    master: vi.fn().mockImplementation(async (_raw: string, target: string) => {
      await writeFile(target, 'music');
      return good;
    }),
    inspect: vi.fn().mockResolvedValue(good),
  };
}
async function existing(job: Awaited<ReturnType<typeof fixture>>, take = 1) {
  const dir = path.join(job.root, storyboard.id, 'music');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `take-${take}.mp3`), 'old');
  await writeFile(
    path.join(dir, `take-${take}.request.json`),
    JSON.stringify({
      model: MUSIC_MODEL,
      prompt: storyboard.music.prompt,
      generatedAt: '2026-10-05',
    }),
  );
  return dir;
}
describe('music job', () => {
  it('validates take counts and selections with estimates', () => {
    expect(musicOptions()).toEqual({ takes: 2 });
    expect(musicOptions('6', '4')).toEqual({ takes: 6, pick: 4 });
    for (const n of ['0', '7', 'nope', '1.5'])
      expect(() => musicOptions(n)).toThrow('estimated');
    for (const n of ['0', '-1', 'nope', '1.5'])
      expect(() => musicOptions('2', n)).toThrow('positive');
  });
  it('reserves failures under a hard $1 ceiling', () => {
    expect(reserveSong(0)).toBe(1);
    expect(reserveSong(11)).toBe(12);
    for (const n of [12, -1, NaN, 1.5])
      expect(() => reserveSong(n)).toThrow('budget');
  });
  it('writes both takes, picks first accepted, records provenance and persists budget', async () => {
    const job = await fixture();
    const operations = ops();
    const selected = await runMusic(job, operations);
    expect(await readFile(selected, 'utf8')).toBe('music');
    expect(operations.generate).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(
        await readFile(path.join(job.root, 'music-budget.json'), 'utf8'),
      ),
    ).toEqual({ attempts: 2, reservedUsd: 0.16 });
    expect(
      await readFile(path.join(job.publicDir, 'music', 'README.md'), 'utf8'),
    ).toContain('calculator-pitch.mp3');
    expect(
      JSON.parse(await readFile(selected.replace('.mp3', '.json'), 'utf8')),
    ).toMatchObject({
      take: 1,
      model: MUSIC_MODEL,
      prompt: storyboard.music.prompt,
    });
    job.options = { takes: 1 };
    await runMusic(job, operations);
    expect(
      existsSync(path.join(job.root, storyboard.id, 'music/take-3.mp3')),
    ).toBe(true);
  });
  it('does not bill --pick or require a key', async () => {
    const job = await fixture();
    await existing(job);
    const operations = ops();
    await runMusic(
      { ...job, options: musicOptions('2', '1'), apiKey: undefined },
      operations,
    );
    expect(operations.generate).not.toHaveBeenCalled();
  });
  it('rejects missing credentials without billing', async () => {
    const job = await fixture();
    await expect(
      runMusic({ ...job, apiKey: undefined }, ops()),
    ).rejects.toThrow('API_KEY');
    await expect(runMusic({ ...job, apiKey: ' ' }, ops())).rejects.toThrow(
      'API_KEY',
    );
  });
  it('stops on provider failure after recording the reservation', async () => {
    const job = await fixture();
    const operations = ops();
    operations.generate.mockRejectedValue(new Error('402 no credits'));
    await expect(runMusic(job, operations)).rejects.toThrow('402');
    expect(
      JSON.parse(
        await readFile(path.join(job.root, 'music-budget.json'), 'utf8'),
      ).attempts,
    ).toBe(1);
  });
  it('skips a rejected take and picks the next passing take', async () => {
    const job = await fixture();
    const operations = ops();
    operations.master.mockRejectedValueOnce(new Error('too short'));
    await runMusic(job, operations);
    const meta = JSON.parse(
      await readFile(
        path.join(job.publicDir, 'music/calculator-pitch.json'),
        'utf8',
      ),
    );
    expect(meta.take).toBe(2);
  });
  it('reports all rejected and prevents explicitly selecting them', async () => {
    const job = await fixture();
    const operations = ops();
    operations.master.mockRejectedValue(new Error('too short'));
    await expect(runMusic(job, operations)).rejects.toThrow('No take passed');
    await expect(
      runMusic({ ...job, options: musicOptions('2', '1') }, operations),
    ).rejects.toThrow('was rejected');
  });
  it.each([
    [-20, -3],
    [-18, -1],
  ])('rejects an unmastered selection (%s,%s)', async (i, tp) => {
    const job = await fixture();
    await existing(job);
    const operations = ops();
    operations.inspect.mockResolvedValue({
      ...good,
      loudness: { ...good.loudness, i, tp },
    });
    await expect(
      runMusic({ ...job, options: musicOptions('2', '1') }, operations),
    ).rejects.toThrow('not a mastered');
  });
  it.each([
    { model: 'other', prompt: storyboard.music.prompt },
    { model: MUSIC_MODEL, prompt: 'old' },
  ])('rejects stale model or prompt %s', async (request) => {
    const job = await fixture();
    const dir = await existing(job);
    await writeFile(
      path.join(dir, 'take-1.request.json'),
      JSON.stringify(request),
    );
    await expect(
      runMusic({ ...job, options: musicOptions('2', '1') }, ops()),
    ).rejects.toThrow('differs');
  });
  it('fails closed when the budget ledger is malformed or exhausted', async () => {
    const job = await fixture();
    await mkdir(job.root, { recursive: true });
    await writeFile(
      path.join(job.root, 'music-budget.json'),
      JSON.stringify({ attempts: 12 }),
    );
    await expect(runMusic(job, ops())).rejects.toThrow('budget');
  });
  it('documents source, prompt and legal limitations', () => {
    const text = musicReadme([
      {
        id: 'test',
        model: MUSIC_MODEL,
        prompt: 'instrumental',
        generatedAt: '2026-10-05',
        take: 1,
        sha256: 'abc',
        report: good,
      },
    ]);
    for (const value of [
      'test.mp3',
      'instrumental',
      'SynthID',
      'No exclusive copyright',
      'https://ai.google.dev/gemini-api/terms',
    ])
      expect(text).toContain(value);
  });
});

// Real inspection via bundled ffmpeg (~5s locally, ~10x slower on CI).
it(
  'uses real inspection operations for --pick',
  { timeout: 120000 },
  async () => {
    const job = await fixture();
    const dir = await existing(job);
    await copyFile(
      path.join(realPublicDir, 'music/calculator-pitch.mp3'),
      path.join(dir, 'take-1.mp3'),
    );
    await expect(
      runMusic({ ...job, options: musicOptions('2', '1') }),
    ).resolves.toContain('calculator-pitch.mp3');
  },
);
it('fails closed while another budget reservation holds the lock', async () => {
  const job = await fixture();
  await mkdir(job.root, { recursive: true });
  await writeFile(path.join(job.root, 'music-budget.lock'), 'held');
  const operations = ops();
  await expect(runMusic(job, operations)).rejects.toThrow('EEXIST');
  expect(operations.generate).not.toHaveBeenCalled();
});
