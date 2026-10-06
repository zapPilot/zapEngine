import { expect, it } from 'vitest';

import { readWav, stereoMono, writeWav } from './wav';

it('round-trips stereo PCM and clamps peaks without wrapping', () => {
  const source = {
    sampleRate: 48000,
    channels: [
      Float64Array.of(-2, -0.5, 0, 0.5, 2),
      Float64Array.of(1, 0, -1, 0, 1),
    ],
  };
  const decoded = readWav(writeWav(source));
  expect(decoded.sampleRate).toBe(48000);
  expect([...decoded.channels[0]!]).toEqual([-1, -0.5, 0, 0.5, 32767 / 32768]);
});
it('ignores padded unknown chunks and rejects malformed formats', () => {
  const good = writeWav({
    sampleRate: 48000,
    channels: [Float64Array.of(0, 1)],
  });
  const chunk = Buffer.alloc(10);
  chunk.write('JUNK');
  chunk.writeUInt32LE(1, 4);
  expect(
    readWav(Buffer.concat([good.subarray(0, 12), chunk, good.subarray(12)]))
      .channels,
  ).toHaveLength(1);
  for (const bytes of [
    Buffer.alloc(2),
    Buffer.alloc(44),
    Buffer.from(good).fill(0, 8, 12),
  ])
    expect(() => readWav(bytes)).toThrow();
  const patches = [
    [16, 4],
    [20, 3],
    [34, 24],
    [22, 0],
    [24, 0],
  ];
  for (const [offset, value] of patches) {
    const bad = Buffer.from(good);
    bad.writeUInt16LE(value!, offset!);
    expect(() => readWav(bad)).toThrow();
  }
  const truncated = Buffer.from(good);
  truncated.writeUInt32LE(100, 40);
  expect(() => readWav(truncated)).toThrow('Truncated');
  const noData = Buffer.from(good);
  noData.write('JUNK', 36);
  expect(() => readWav(noData)).toThrow();
  const odd = Buffer.concat([good, Buffer.from([0])]);
  odd.writeUInt32LE(5, 40);
  expect(() => readWav(odd)).toThrow();
});
it('rejects empty, mismatched and unclocked PCM', () => {
  for (const pcm of [
    { sampleRate: 48000, channels: [] },
    { sampleRate: 48000, channels: [new Float64Array()] },
    { sampleRate: 0, channels: [Float64Array.of(1)] },
    {
      sampleRate: 48000,
      channels: [Float64Array.of(1), Float64Array.of(1, 2)],
    },
  ])
    expect(() => writeWav(pcm)).toThrow();
});

it('checks channel dimensions before mixing to mono', () => {
  expect([
    ...stereoMono({
      sampleRate: 48000,
      channels: [Float64Array.of(0.1), Float64Array.of(0.3)],
    }),
  ]).toEqual([0.2]);
  expect(() => stereoMono({ sampleRate: 48000, channels: [] })).toThrow(
    'Stereo',
  );
  expect(() =>
    stereoMono({
      sampleRate: 48000,
      channels: [Float64Array.of(1), Float64Array.of(1, 2)],
    }),
  ).toThrow('lengths');
});
