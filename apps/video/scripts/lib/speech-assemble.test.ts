import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { assembleLine, synthesizeLine } from './speech-assemble';
import { BRAND_CLIPS } from './speech-plan';

const loudness = JSON.stringify({
  input_i: '-18',
  input_tp: '-3',
  input_lra: '1',
  input_thresh: '-28',
  target_offset: '0',
});
const tools = () => ({
  duration: vi.fn().mockResolvedValue(2),
  run: vi.fn(async (args: readonly string[]) =>
    args.includes('null') && args.some((a) => a.includes('loudnorm'))
      ? loudness
      : 'silence_start: 0\nsilence_end: 0.05\nsilence_start: 1.95\nsilence_end: 2',
  ),
});
it('trims only internal edges, emits pauses and gain and masters once', async () => {
  const ops = tools();
  expect(
    await assembleLine(
      [
        { kind: 'audio', file: 'a' },
        { kind: 'pause', ms: 750 },
        { kind: 'audio', file: 'b', gainDb: 2 },
      ],
      'scratch',
      'out',
      0.015,
      ops,
    ),
  ).toEqual([0.78]);
  const graph = ops.run.mock.calls[2]![0].join(' ');
  expect(graph).toContain('atrim=start=0:end=1.9649999999999999');
  expect(graph).toContain('atrim=start=0.035:end=2');
  expect(graph).toContain('volume=2dB');
  expect(graph).toContain('atrim=duration=0.75,asetpts=PTS-STARTPTS');
  expect(graph).toContain('concat=n=3:v=0:a=1');
  expect(ops.run.mock.calls[0]![0].join(' ')).toContain(
    'silencedetect=noise=-45dB:d=0.02',
  );
});
it('clamps retained windows inside the file without cutting speech', async () => {
  const ops = tools();
  await assembleLine(
    [
      { kind: 'audio', file: 'a' },
      { kind: 'audio', file: 'b' },
    ],
    's',
    'o',
    1,
    ops,
  );
  const graph = ops.run.mock.calls[2]![0].join(' ');
  expect(graph).toContain('atrim=start=0:end=2');
});
it('rejects silent parts and propagates run failure', async () => {
  const ops = tools();
  ops.run.mockResolvedValueOnce('silence_start: 0');
  await expect(
    assembleLine([{ kind: 'audio', file: 'a' }], 's', 'o', undefined, ops),
  ).rejects.toThrow('Silent');
  ops.run.mockRejectedValueOnce(new Error('failed'));
  await expect(
    assembleLine([{ kind: 'audio', file: 'a' }], 's', 'o', 0.01, ops),
  ).rejects.toThrow('failed');
});
it.each([
  { parts: [] },
  { parts: [{ kind: 'pause' as const, ms: 100 }] },
  {
    parts: [
      { kind: 'audio' as const, file: 'a' },
      { kind: 'pause' as const, ms: 100 },
    ],
  },
])(
  'rejects invalid line edges %j',
  async ({ parts }) =>
    await expect(assembleLine(parts, 's', 'o', 0.01, tools())).rejects.toThrow(
      'begin and end',
    ),
);
it.each([-1, NaN])(
  'rejects invalid keep %s',
  async (keep) =>
    await expect(
      assembleLine([{ kind: 'audio', file: 'a' }], 's', 'o', keep, tools()),
    ).rejects.toThrow('retention'),
);
it('sends only planned TTS fragments, never the brand, and uses the shared clip', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'assemble-test-'));
  const ops = tools();
  const synthesize = vi.fn(async (_text: string) => Buffer.from('raw'));
  try {
    await synthesizeLine(
      [
        { kind: 'tts', text: 'Hello:' },
        { kind: 'pause', ms: 750 },
        { kind: 'clip', clip: BRAND_CLIPS['kokode']! },
        { kind: 'tts', text: 'right here.' },
      ],
      { scratch, target: 'out', publicDir: '/public', synthesize, tools: ops },
    );
    expect(synthesize.mock.calls).toEqual([['Hello:'], ['right here.']]);
    expect(ops.run.mock.calls[1]![0]).toContain(
      '/public/brand/audio/kokode-adrian-ja.mp3',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
it('single fragment uses the legacy master and synth failure never masters', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'assemble-test-'));
  const ops = tools();
  try {
    expect(
      await synthesizeLine([{ kind: 'tts', text: 'Hello' }], {
        scratch,
        target: 'out',
        publicDir: 'p',
        synthesize: async () => Buffer.from('raw'),
        tools: ops,
      }),
    ).toEqual([]);
    expect(ops.run).toHaveBeenCalledTimes(3);
    ops.run.mockClear();
    await expect(
      synthesizeLine([{ kind: 'tts', text: 'Hello' }], {
        scratch,
        target: 'out',
        publicDir: 'p',
        synthesize: async () => {
          throw new Error('synth');
        },
        tools: ops,
      }),
    ).rejects.toThrow('synth');
    expect(ops.run).not.toHaveBeenCalled();
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
