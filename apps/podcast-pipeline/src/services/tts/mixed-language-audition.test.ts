import { expect, it, vi } from 'vitest';

import { auditionMixedLanguage } from './mixed-language-audition.js';
it('synthesizes each raw fragment once and isolates matrix renders, including classroom joins', async () => {
  const synthesize = vi.fn(async (text: string) => ({
    audio: Buffer.from(text),
    cost: [],
  }));
  const render = vi.fn(async (parts, opts, deps) => {
    for (const part of parts)
      if (part.kind === 'speech') await deps.synthesize(part.text, opts);
    return { audio: Buffer.from('render'), cost: [] };
  });
  const measure = vi.fn(async () => ({
    durationSeconds: 1,
    silences: [{ start: 0, end: 0.1 }],
  }));
  const save = vi.fn(async () => {});
  const concat = vi.fn(async () => Buffer.from('join'));
  const report = await auditionMixedLanguage(
    { engine: 'e', modelId: 'voice' },
    { synthesize, render, measure, save, concat },
  );
  expect(render).toHaveBeenCalledTimes(25);
  expect(concat).toHaveBeenCalledTimes(5);
  expect(save).toHaveBeenCalledTimes(30);
  const texts = synthesize.mock.calls.map(([text]) => text);
  expect(new Set(texts).size).toBe(texts.length);
  expect(render.mock.calls.map((call) => call[2].trim).slice(0, 5)).toEqual([
    { retainSeconds: 0.06 },
    { retainSeconds: 0.02 },
    { retainSeconds: 0.015 },
    { retainSeconds: 0.01 },
    {
      retainSeconds: 0.015,
      minSilenceSeconds: 0.03,
      edgeToleranceSeconds: 0.02,
    },
  ]);
  expect(report).toContain('classroom ja→en');
  expect(report).toContain('production 4.1');
  expect(report).toContain('raw');
});
it('propagates failed raw synthesis', async () => {
  await expect(
    auditionMixedLanguage(
      { engine: 'e', modelId: 'v' },
      {
        synthesize: vi.fn().mockRejectedValue(new Error('failed')),
        render: vi.fn(),
        measure: vi.fn(),
        save: vi.fn(),
        concat: vi.fn(),
      },
    ),
  ).rejects.toThrow('failed');
});
