import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { VOICES } from '../../src/timeline/voices';
import { getVideo } from '../../src/videos/catalog';
import { verifyBrandAsset } from './brand-asset';
import { brandOptions, runBrandAudio } from './brand-audio-job';
import { BRAND_CLIPS } from './speech-plan';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'brand-test-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const loudness = JSON.stringify({
  input_i: '-18',
  input_tp: '-3',
  input_lra: '1',
  input_thresh: '-28',
  target_offset: '0',
});
const operations = () => ({
  synthesize: vi.fn(async (_request: unknown) => Buffer.from('exact bytes')),
  tools: {
    duration: vi.fn(async () => 0.8),
    run: vi.fn(
      async () =>
        `silence_start: 0\nsilence_end: 0.1\nsilence_start: 0.7\n${loudness}`,
    ),
  },
  now: () => '2026-10-05T00:00:00.000Z',
  log: vi.fn(),
});
const job = (values: Parameters<typeof brandOptions>[0]) => ({
  clip: BRAND_CLIPS['kokode']!,
  id: 'kokode',
  root: path.join(root, 'out'),
  publicDir: path.join(root, 'public'),
  engine: 'engine',
  apiKey: 'secret',
  options: brandOptions(values),
  storyboard: getVideo('kokode-clinic').storyboard,
  baseline: {},
});
async function generate() {
  const j = job({ takes: '1' });
  await runBrandAudio(j, operations());
  return j;
}
it.each([
  {},
  { takes: '1', pick: '1' },
  { takes: '0' },
  { takes: '7' },
  { takes: '1,2' },
  { pick: '0' },
  { audition: true, keep: 'NaN' },
  { audition: true, 'pause-scale': '0' },
  { audition: true, take: '1.1' },
])('rejects invalid options %j', (values) =>
  expect(() => brandOptions(values)).toThrow(),
);
it('parses the explicit actions and axes', () => {
  expect(
    brandOptions({
      audition: true,
      take: '1,2',
      keep: '0.01,0.02',
      'pause-scale': '0.6,1.3',
      replace: true,
    }),
  ).toMatchObject({
    audition: true,
    take: [1, 2],
    keep: [0.01, 0.02],
    pauseScale: [0.6, 1.3],
    replace: true,
  });
  expect(brandOptions({ pick: '2' }).pick).toBe(2);
});
it('generates immutable numbered takes and provenance, never selects', async () => {
  const j = job({ takes: '2' });
  const ops = operations();
  const files = await runBrandAudio(j, ops);
  expect(files.map((f) => path.basename(f))).toEqual([
    'take-1.mp3',
    'take-2.mp3',
  ]);
  expect(ops.synthesize.mock.calls[0]![0]).toMatchObject({
    text: 'ここで',
    referenceId: VOICES.adrian.id,
    speed: 1,
    apiKey: 'secret',
  });
  const request = await readFile(
    path.join(j.root, 'kokode/take-1.request.json'),
    'utf8',
  );
  expect(request).not.toContain('secret');
  expect(JSON.parse(request)).toEqual({
    text: 'ここで',
    voice: 'adrian',
    referenceId: VOICES.adrian.id,
    engine: 'engine',
    speed: 1,
    generatedAt: '2026-10-05T00:00:00.000Z',
  });
  await expect(readdir(j.publicDir)).rejects.toThrow();
  expect(
    (
      await runBrandAudio({ ...j, options: brandOptions({ takes: '1' }) }, ops)
    )[0],
  ).toContain('take-3.mp3');
});
it('requires key and records failed synthesis', async () => {
  const j = job({ takes: '1' });
  await expect(
    runBrandAudio({ ...j, apiKey: undefined }, operations()),
  ).rejects.toThrow('API_KEY');
  const ops = operations();
  ops.synthesize.mockRejectedValueOnce(new Error('failed'));
  await expect(runBrandAudio(j, ops)).rejects.toThrow('failed');
  expect(
    await readFile(path.join(j.root, 'kokode/take-1.failed.txt'), 'utf8'),
  ).toContain('failed');
});
it('refuses generation/pick over approved assets unless replace is explicit', async () => {
  const j = await generate();
  const selected = { ...j, options: brandOptions({ pick: '1' }) };
  await runBrandAudio(selected, operations());
  await expect(runBrandAudio(selected, operations())).rejects.toThrow(
    '--replace',
  );
  await expect(runBrandAudio(j, operations())).rejects.toThrow('--replace');
  await expect(
    runBrandAudio(
      {
        ...j,
        clip: { ...j.clip, status: 'approved' },
        publicDir: path.join(root, 'empty'),
      },
      operations(),
    ),
  ).rejects.toThrow('--replace');
  await runBrandAudio(
    { ...selected, options: brandOptions({ pick: '1', replace: true }) },
    operations(),
  );
});
it('pick needs no key, copies exact bytes and verifies provenance', async () => {
  const j = await generate();
  const [file] = await runBrandAudio(
    { ...j, apiKey: undefined, options: brandOptions({ pick: '1' }) },
    operations(),
  );
  expect(await readFile(file!)).toEqual(Buffer.from('exact bytes'));
  expect(() => verifyBrandAsset(j.clip, j.publicDir, j.engine)).not.toThrow();
  const sidecar = file!.replace(/\.mp3$/, '.json');
  const original = JSON.parse(await readFile(sidecar, 'utf8'));
  for (const [key, value] of Object.entries({
    spokenText: 'wrong',
    displayText: 'wrong',
    voice: 'hannah',
    speed: 2,
    referenceId: 'wrong',
    engine: 'wrong',
    sha256: 'a'.repeat(64),
    humanApproved: false,
    durationSeconds: 3,
  })) {
    await writeFile(sidecar, JSON.stringify({ ...original, [key]: value }));
    expect(() => verifyBrandAsset(j.clip, j.publicDir, j.engine)).toThrow();
  }
});
it('pick rejects missing, drifted, silent and out-of-range takes', async () => {
  const j = await generate();
  await expect(
    runBrandAudio({ ...j, options: brandOptions({ pick: '2' }) }, operations()),
  ).rejects.toThrow('Unknown');
  const req = path.join(j.root, 'kokode/take-1.request.json');
  const original = await readFile(req, 'utf8');
  await writeFile(
    req,
    JSON.stringify({ ...JSON.parse(original), engine: 'other' }),
  );
  await expect(
    runBrandAudio({ ...j, options: brandOptions({ pick: '1' }) }, operations()),
  ).rejects.toThrow('differs');
  await writeFile(req, original);
  const ops = operations();
  ops.tools.run.mockResolvedValueOnce(`silence_start: 0\n${loudness}`);
  await expect(
    runBrandAudio({ ...j, options: brandOptions({ pick: '1' }) }, ops),
  ).rejects.toThrow('no speech');
  ops.tools.duration.mockResolvedValue(3);
  await expect(
    runBrandAudio({ ...j, options: brandOptions({ pick: '1' }) }, ops),
  ).rejects.toThrow();
});
it('auditions all candidates through assembly and reuses disk fragments', async () => {
  const j = await generate();
  const ops = operations();
  const baseline = path.join(root, 'baseline.mp3');
  await writeFile(baseline, 'old');
  const audition = {
    ...j,
    options: brandOptions({
      audition: true,
      keep: '0.01,0.02',
      'pause-scale': '1,0.6',
    }),
    baseline: { 'turn-solution': baseline },
  };
  const files = await runBrandAudio(audition, ops);
  expect(files).toHaveLength(12);
  expect(ops.synthesize).toHaveBeenCalledTimes(4);
  expect(
    ops.synthesize.mock.calls.every(
      ([r]) => !String((r as { text: string }).text).includes('Kokode'),
    ),
  ).toBe(true);
  await runBrandAudio({ ...audition, apiKey: undefined }, ops);
  expect(ops.synthesize).toHaveBeenCalledTimes(4);
  const checklist = await readFile(
    path.join(j.root, 'kokode/CHECKLIST.md'),
    'utf8',
  );
  expect(checklist).toContain('clicks/pops');
  expect(checklist).toContain('planned gaps');
  expect(
    await readFile(
      path.join(j.root, 'kokode/baseline-turn-solution.mp3'),
      'utf8',
    ),
  ).toBe('old');
});
it('audition fails for no takes, unknown take or missing fragment key', async () => {
  const j = job({ audition: true });
  await expect(runBrandAudio(j, operations())).rejects.toThrow('No candidates');
  await generate();
  await expect(
    runBrandAudio(
      { ...j, options: brandOptions({ audition: true, take: '2' }) },
      operations(),
    ),
  ).rejects.toThrow('Unknown');
  await expect(
    runBrandAudio(
      {
        ...j,
        apiKey: undefined,
        options: brandOptions({ audition: true, take: '1' }),
      },
      operations(),
    ),
  ).rejects.toThrow('API_KEY');
});
it('sorts multiple candidates and auditions lines using text without say', async () => {
  const j = job({ takes: '2' });
  await runBrandAudio(j, operations());
  const storyboard = {
    ...j.storyboard,
    scenes: [
      {
        ...j.storyboard.scenes[0]!,
        vo: [{ id: 'test', text: 'Kokode Hello.' }],
      },
    ],
  };
  const files = await runBrandAudio(
    { ...j, storyboard, options: brandOptions({ audition: true }) },
    operations(),
  );
  expect(files.map((file) => path.basename(file))).toEqual([
    'take-1-test-keep-0.015-pause-1.mp3',
    'take-2-test-keep-0.015-pause-1.mp3',
  ]);
});
