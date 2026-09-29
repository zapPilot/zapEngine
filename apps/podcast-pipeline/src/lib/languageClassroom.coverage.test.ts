import { describe, expect, it } from 'vitest';

import { normalizeClassroomAudioTrack } from './languageClassroom.js';

describe('normalizeClassroomAudioTrack coverage', () => {
  it('reads the language_code fallback when newer keys are absent', () => {
    expect(
      normalizeClassroomAudioTrack({
        language_code: 'ja',
        hls_url: 'https://example.test/ja/playlist.m3u8',
      }),
    ).toEqual({
      languageCode: 'ja',
      hlsUrl: 'https://example.test/ja/playlist.m3u8',
    });
  });

  it('reads the languageCode fallback when target keys are absent', () => {
    expect(
      normalizeClassroomAudioTrack({
        languageCode: 'en',
        hlsUrl: 'https://example.test/en/playlist.m3u8',
      }),
    ).toEqual({
      languageCode: 'en',
      hlsUrl: 'https://example.test/en/playlist.m3u8',
    });
  });
});
