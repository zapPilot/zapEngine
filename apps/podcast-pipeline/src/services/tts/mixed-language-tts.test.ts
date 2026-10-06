import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  synthesize: vi.fn(),
  trim: vi.fn(),
  silence: vi.fn(),
  concat: vi.fn(),
  sleep: vi.fn(),
}));
vi.mock('./fish-audio.js', () => ({
  synthesize: mocks.synthesize,
  getRequestDelayMs: () => 3000,
}));
vi.mock('./audio-trim.js', () => ({
  trimMp3Silence: mocks.trim,
  createSilentMp3: mocks.silence,
}));
vi.mock('./audio-concat.js', () => ({ concatMp3Buffers: mocks.concat }));
vi.mock('../../lib/sleep.js', () => ({ sleep: mocks.sleep }));

import { buildMixedLanguagePlan } from './mixed-language-text.js';
import {
  englishTermClipKey,
  synthesizeMixedLanguage,
  withEnglishTermClipReuse,
} from './mixed-language-tts.js';

const options = {
  languageCode: 'zh-Hant' as const,
  config: { engine: 's2.1-pro-free', modelId: 'voice' },
};
const text = 'EigenLayer 最近出现变化，EigenLayer 的 TVL 开始下降。';

beforeEach(() => {
  vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'voice');
  vi.stubEnv('FISH_AUDIO_ENGINE', 's2.1-pro-free');
  mocks.synthesize.mockImplementation(async (source: string, opts) => ({
    audio: Buffer.from(source),
    cost: [
      {
        category: 'tts',
        label: 'TTS audio',
        provider: 'fish-audio',
        model: opts.config.engine,
        costUsd: 1,
        usage: {
          unit: 'utf8_bytes',
          quantity: Buffer.byteLength(source),
          unitPriceUsd: 1,
        },
      },
    ],
  }));
  mocks.trim.mockImplementation(async (audio) => audio);
  mocks.silence.mockImplementation(async (ms) => Buffer.from(`pause:${ms}`));
  mocks.concat.mockImplementation(async (buffers) => Buffer.concat(buffers));
  mocks.sleep.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('mixed-language orchestration', () => {
  it('reuses identical terms, preserves order and bills only new requests', async () => {
    const plan = buildMixedLanguagePlan(text, 'zh-Hant');
    if (!plan) throw new Error('expected a mixed-language plan');
    const result = await synthesizeMixedLanguage(plan, options);
    const buffers: Buffer[] = mocks.concat.mock.calls[0]![0];
    expect(buffers.map((b) => b.toString())).toEqual([
      'EigenLayer',
      '最近出现变化，',
      'pause:100',
      'EigenLayer',
      '的 ',
      'TVL',
      '开始下降。',
    ]);
    expect(buffers[0]).toBe(buffers[3]);
    expect(mocks.synthesize.mock.calls.map(([source]) => source)).toEqual([
      'EigenLayer',
      '最近出现变化，',
      '的 ',
      'TVL',
      '开始下降。',
    ]);
    expect(mocks.trim).toHaveBeenCalledTimes(5);
    for (const call of mocks.trim.mock.calls)
      expect(call[1]).toEqual({ retainSeconds: 0.06 });
    expect(mocks.sleep.mock.calls).toEqual([[3000], [3000], [3000], [3000]]);
    expect(result.cost).toEqual([
      expect.objectContaining({
        costUsd: 5,
        usage: {
          unit: 'utf8_bytes',
          unitPriceUsd: 1,
          quantity: Buffer.byteLength(
            'EigenLayer最近出现变化，的 TVL开始下降。',
          ),
        },
      }),
    ]);
    expect(console.log).toHaveBeenCalledWith(
      '[/tts] Fish Audio mixed-language TTS',
      {
        languageCode: 'zh-Hant',
        englishSpans: 3,
        uniqueEnglishTerms: 2,
        reusedEnglishClips: 1,
        nativeFragments: 3,
        pauses: 1,
        fishRequests: 5,
      },
    );
  });
  it('shares English clips and pauses across nested scopes, but native clips only within a call', async () => {
    const parts = [
      { kind: 'speech', text: 'BTC', english: true },
      { kind: 'pause', ms: 100 },
      { kind: 'speech', text: '中文', english: false },
      { kind: 'pause', ms: 100 },
      { kind: 'speech', text: '中文', english: false },
    ] as const;
    await withEnglishTermClipReuse(async () => {
      await synthesizeMixedLanguage([...parts], options);
      await withEnglishTermClipReuse(() =>
        synthesizeMixedLanguage([...parts], options),
      );
    });
    expect(mocks.synthesize.mock.calls.map(([source]) => source)).toEqual([
      'BTC',
      '中文',
      '中文',
    ]);
    expect(mocks.silence).toHaveBeenCalledTimes(1);
    expect(mocks.sleep).toHaveBeenCalledTimes(1);
    const first = mocks.concat.mock.calls[0]![0];
    const second = mocks.concat.mock.calls[1]![0];
    expect(first[0]).toBe(second[0]);
    expect(first[2]).toBe(first[4]);
    expect(first[2]).not.toBe(second[2]);
  });
  it('isolates calls without a scope and separate episode scopes', async () => {
    const parts = [
      { kind: 'speech', text: 'BTC', english: true },
      { kind: 'speech', text: '中文', english: false },
    ] as const;
    await synthesizeMixedLanguage([...parts], options);
    await synthesizeMixedLanguage([...parts], options);
    await withEnglishTermClipReuse(() =>
      synthesizeMixedLanguage([...parts], options),
    );
    expect(mocks.synthesize).toHaveBeenCalledTimes(6);
  });
  it('separates engine and reference ID and reuses across zh/ja calls', async () => {
    const zhParts = [
      { kind: 'speech', text: 'BTC', english: true },
      { kind: 'speech', text: '中文', english: false },
    ] as const;
    const jaParts = [
      { kind: 'speech', text: 'BTC', english: true },
      { kind: 'speech', text: 'について', english: false },
    ] as const;
    await withEnglishTermClipReuse(async () => {
      await synthesizeMixedLanguage([...zhParts], options);
      await synthesizeMixedLanguage([...jaParts], {
        ...options,
        languageCode: 'ja',
      });
      await synthesizeMixedLanguage([...zhParts], {
        ...options,
        config: { engine: 'future-model-free', modelId: 'voice' },
      });
      await synthesizeMixedLanguage([...zhParts], {
        ...options,
        config: { engine: 'future-model-free', modelId: 'voice2' },
      });
    });
    expect(
      mocks.synthesize.mock.calls.filter(([source]) => source === 'BTC'),
    ).toHaveLength(3);
    expect(englishTermClipKey(options.config, 'BTC')).toBe(
      '["s2.1-pro-free","voice","BTC"]',
    );
  });
  it.each(['synthesize', 'trim', 'silence', 'concat'] as const)(
    'propagates %s failure',
    async (failure) => {
      mocks[failure].mockRejectedValueOnce(new Error(`${failure} failed`));
      const plan = buildMixedLanguagePlan(text, 'zh-Hant');
      if (!plan) throw new Error('expected a mixed-language plan');
      await expect(synthesizeMixedLanguage(plan, options)).rejects.toThrow(
        `${failure} failed`,
      );
    },
  );
});

it('audition overrides synthesizer, retention and request delay', async () => {
  const synthesize = vi.fn(async (text: string) => ({
    audio: Buffer.from(text),
    cost: [],
  }));
  await synthesizeMixedLanguage(
    [
      { kind: 'speech', text: 'BTC', english: true },
      { kind: 'speech', text: 'について', english: false },
    ],
    options,
    {
      synthesize,
      trim: {
        retainSeconds: 0.015,
        minSilenceSeconds: 0.03,
        edgeToleranceSeconds: 0.02,
      },
      requestDelayMs: 0,
    },
  );
  expect(synthesize).toHaveBeenCalledTimes(2);
  expect(mocks.synthesize).not.toHaveBeenCalled();
  expect(mocks.trim.mock.calls[0]![1]).toEqual({
    retainSeconds: 0.015,
    minSilenceSeconds: 0.03,
    edgeToleranceSeconds: 0.02,
  });
  expect(mocks.sleep).toHaveBeenCalledWith(0);
});
