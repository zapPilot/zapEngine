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

import { textToSpeech } from '../tts.js';
import {
  englishTermClipKey,
  synthesizeMixedLanguage,
  withEnglishTermClipReuse,
} from './mixed-language-tts.js';

const options = {
  languageCode: 'zh-Hant' as const,
  config: { engine: 's2-pro', modelId: 'voice' },
};
const text = 'EigenLayer 最近出现变化，EigenLayer 的 TVL 开始下降。';

beforeEach(() => {
  vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'voice');
  vi.stubEnv('FISH_AUDIO_ENGINE', 's2-pro');
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
  it('reuses identical terms, preserves order and bills only new requests through the facade', async () => {
    const result = await textToSpeech(text, { languageCode: 'zh-Hant' });
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
    expect(mocks.sleep.mock.calls).toEqual([[3000], [3000], [3000], [3000]]);
    expect(result.cost).toEqual([
      expect.objectContaining({
        costUsd: 0,
        usage: {
          unit: 'utf8_bytes',
          unitPriceUsd: 0,
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
    await textToSpeech('BTC中文', { languageCode: 'zh-Hant' });
    await textToSpeech('BTC中文', { languageCode: 'zh-Hant' });
    await withEnglishTermClipReuse(() =>
      textToSpeech('BTC中文', { languageCode: 'zh-Hant' }),
    );
    expect(mocks.synthesize).toHaveBeenCalledTimes(6);
  });
  it('separates engine and reference ID and reuses across zh/ja calls', async () => {
    await withEnglishTermClipReuse(async () => {
      await textToSpeech('BTC中文', { languageCode: 'zh-Hant' });
      await textToSpeech('BTCについて', { languageCode: 'ja' });
      vi.stubEnv('FISH_AUDIO_ENGINE', 's1');
      await textToSpeech('BTC中文', { languageCode: 'zh-Hant' });
      vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'voice2');
      await textToSpeech('BTC中文', { languageCode: 'zh-Hant' });
    });
    expect(
      mocks.synthesize.mock.calls.filter(([source]) => source === 'BTC'),
    ).toHaveLength(3);
    expect(englishTermClipKey(options.config, 'BTC')).toBe(
      '["s2-pro","voice","BTC"]',
    );
  });
  it.each(['synthesize', 'trim', 'silence', 'concat'] as const)(
    'propagates %s failure without whole-text fallback',
    async (failure) => {
      mocks[failure].mockRejectedValueOnce(new Error(`${failure} failed`));
      await expect(
        textToSpeech(text, { languageCode: 'zh-Hant' }),
      ).rejects.toThrow(`${failure} failed`);
      expect(
        mocks.synthesize.mock.calls.map(([source]) => source),
      ).not.toContain(text);
    },
  );
});
