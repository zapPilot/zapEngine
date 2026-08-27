import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTtsConfig } from './tts-config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getTtsConfig', () => {
  it('returns Fish Audio config', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'fish-reference');

    expect(getTtsConfig()).toEqual({
      modelId: 'fish-reference',
      engine: 's2-pro',
    });
  });

  it('uses FISH_AUDIO_ENGINE when configured', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'fish-reference');
    vi.stubEnv('FISH_AUDIO_ENGINE', 's1');

    expect(getTtsConfig()).toEqual({
      modelId: 'fish-reference',
      engine: 's1',
    });
  });

  it('trims Fish Audio config values', () => {
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', '  fish-reference  ');
    vi.stubEnv('FISH_AUDIO_ENGINE', '  s2-pro  ');

    expect(getTtsConfig()).toEqual({
      modelId: 'fish-reference',
      engine: 's2-pro',
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
});

describe('retired Google TTS', () => {
  it('does not restore Google routing through the legacy TTS_PROVIDER env', () => {
    vi.stubEnv('TTS_PROVIDER', 'google');
    vi.stubEnv('FISH_AUDIO_REFERENCE_ID', 'fish-reference');

    expect(getTtsConfig()).toEqual({
      modelId: 'fish-reference',
      engine: 's2-pro',
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
