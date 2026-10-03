import { describe, expect, it } from 'vitest';

import { parseVoManifest } from './manifest';

describe('parseVoManifest', () => {
  it('accepts an empty manifest so a draft storyboard can be previewed', () => {
    expect(
      parseVoManifest({ videoId: 'v', engine: '', voiceKey: '', lines: {} })
        .lines,
    ).toEqual({});
  });

  it('rejects a clip without a positive duration', () => {
    expect(() =>
      parseVoManifest({
        videoId: 'v',
        engine: 'e',
        voiceKey: 'k',
        lines: {
          a: { file: 'vo/a.mp3', fingerprint: 'f', durationSeconds: 0 },
        },
      }),
    ).toThrow();
  });
});
