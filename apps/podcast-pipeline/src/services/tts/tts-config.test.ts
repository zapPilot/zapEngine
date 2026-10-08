import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getTtsConfig,
  JAPANESE_FISH_AUDIO_REFERENCE_ID,
} from './tts-config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getTtsConfig', () => {
  it('returns Fish Audio config', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'fish-reference');

    expect(getTtsConfig()).toEqual({
      modelId: 'fish-reference',
      engine: 's2.1-pro-free',
    });
  });

  it('uses FISH_AUDIO_ENGINE when configured', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'fish-reference');
    vi.stubEnv('FISH_AUDIO_ENGINE', 'future-model-free');

    expect(getTtsConfig()).toEqual({
      modelId: 'fish-reference',
      engine: 'future-model-free',
    });
  });

  it('trims Fish Audio config values', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', '  fish-reference  ');
    vi.stubEnv('FISH_AUDIO_ENGINE', '  s2.1-pro-free  ');

    expect(getTtsConfig()).toEqual({
      modelId: 'fish-reference',
      engine: 's2.1-pro-free',
    });
  });

  it.each([
    ['unset', ''],
    ['whitespace only', '   '],
  ])('fails closed when FISH_AUDIO_REFERENCE_ID is %s', (_label, value) => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', value);

    expect(() => getTtsConfig()).toThrow(
      'FISH_AUDIO_REFERENCE_ID is required for Fish Audio TTS',
    );
  });

  it('uses the owner voice for zh-Hant and en', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'owner-voice');

    expect(getTtsConfig('zh-Hant').modelId).toBe('owner-voice');
    expect(getTtsConfig('en').modelId).toBe('owner-voice');
  });

  it('uses someone else’s voice for ja by default', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'owner-voice');

    expect(getTtsConfig('ja')).toEqual({
      modelId: JAPANESE_FISH_AUDIO_REFERENCE_ID,
      engine: 's2.1-pro-free',
    });
    expect(JAPANESE_FISH_AUDIO_REFERENCE_ID).toBe(
      '63bc41e652214372b15d9416a30a60b4',
    );
  });

  it('prefers FISH_AUDIO_REFERENCE_ID_JA for ja without touching other languages', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'owner-voice');
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID_JA', '  ja-override  ');

    expect(getTtsConfig('ja').modelId).toBe('ja-override');
    expect(getTtsConfig('zh-Hant').modelId).toBe('owner-voice');
    expect(getTtsConfig('en').modelId).toBe('owner-voice');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
  ])('fails closed when FISH_AUDIO_REFERENCE_ID_JA is %s', (_label, value) => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'owner-voice');
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID_JA', value);

    expect(() => getTtsConfig('ja')).toThrow(
      'FISH_AUDIO_REFERENCE_ID_JA is required for Japanese Fish Audio TTS when set',
    );
  });
});

describe('retired Google TTS', () => {
  it('does not restore Google routing through the legacy TTS_PROVIDER env', () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'fish-reference');

    expect(getTtsConfig()).toEqual({
      modelId: 'fish-reference',
      engine: 's2.1-pro-free',
    });
  });

  it('keeps podcast-pipeline package dependencies free of Google TTS', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies).not.toHaveProperty(
      '@google-cloud/text-to-speech',
    );
  });
});
it.each(['s2-pro', 's1', 's2.1-pro', 'free-paid'])(
  'rejects paid override %s',
  (engine) => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'voice');
    vi.stubEnv('FISH_AUDIO_ENGINE', engine);
    expect(() => getTtsConfig()).toThrow('only allows free');
  },
);
