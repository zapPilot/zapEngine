import { describe, expect, it } from 'vitest';

import type { PodcastAudioTrack } from '@/integration/podcastFeed';
import {
  buildPlaybackSections,
  DEFAULT_PODCAST_SPEED_PREFERENCES,
  findPlaybackSection,
  nextPlaybackSection,
  parseStoredSpeedPreferences,
  speedForSection,
  withSectionSpeed,
} from '@/integration/podcastSections';
import { createPodcastEpisodeFactory } from './support/podcastEpisode';

function track(overrides: Partial<PodcastAudioTrack> = {}): PodcastAudioTrack {
  return {
    languageCode: 'zh-Hant',
    title: 'Episode',
    hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
    classroomHlsUrl: 'https://cdn.example.com/classroom/playlist.m3u8',
    classrooms: [],
    ...overrides,
  };
}

const episode = createPodcastEpisodeFactory({
  hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
  audioTracks: [track()],
});

describe('buildPlaybackSections', () => {
  it('includes a classroom section whenever a classroom URL is present (invariant)', () => {
    const sections = buildPlaybackSections(episode({}));
    expect(sections.map((section) => section.kind)).toEqual([
      'main',
      'classroom',
    ]);
    expect(sections[1]!.hlsUrl).toBe(
      'https://cdn.example.com/classroom/playlist.m3u8',
    );
  });

  it('returns main-only when the classroom URL is null, empty, or whitespace', () => {
    for (const classroomHlsUrl of [null, '', '   ']) {
      const sections = buildPlaybackSections(
        episode({ audioTracks: [track({ classroomHlsUrl })] }),
      );
      expect(sections.map((section) => section.kind)).toEqual(['main']);
    }
  });

  it('never returns an empty section list even with no audio tracks', () => {
    const sections = buildPlaybackSections(episode({ audioTracks: [] }));
    expect(sections).toHaveLength(1);
    expect(sections[0]).toEqual({
      kind: 'main',
      hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
      languageCode: null,
    });
  });

  it('resolves the classroom URL from the track matching the episode hlsUrl', () => {
    const sections = buildPlaybackSections(
      episode({
        hlsUrl: 'https://cdn.example.com/ja/main.m3u8',
        languageCode: 'ja',
        audioTracks: [
          track({
            languageCode: 'zh-Hant',
            hlsUrl: 'https://cdn.example.com/zh/main.m3u8',
            classroomHlsUrl: 'https://cdn.example.com/zh/classroom.m3u8',
          }),
          track({
            languageCode: 'ja',
            hlsUrl: 'https://cdn.example.com/ja/main.m3u8',
            classroomHlsUrl: 'https://cdn.example.com/ja/classroom.m3u8',
          }),
        ],
      }),
    );
    expect(sections[1]?.hlsUrl).toBe(
      'https://cdn.example.com/ja/classroom.m3u8',
    );
  });

  it('falls back to the track matching languageCode when no hlsUrl matches', () => {
    const sections = buildPlaybackSections(
      episode({
        hlsUrl: 'https://cdn.example.com/unknown.m3u8',
        languageCode: 'ja',
        audioTracks: [
          track({
            languageCode: 'ja',
            hlsUrl: 'https://cdn.example.com/ja/main.m3u8',
            classroomHlsUrl: 'https://cdn.example.com/ja/classroom.m3u8',
          }),
        ],
      }),
    );
    expect(sections[1]?.hlsUrl).toBe(
      'https://cdn.example.com/ja/classroom.m3u8',
    );
  });

  it('prefers per-language classroom tracks over the legacy combined URL', () => {
    const sections = buildPlaybackSections(
      episode({
        audioTracks: [
          track({
            classroomHlsUrl: 'https://cdn.example.com/legacy/classroom.m3u8',
            classrooms: [
              { languageCode: 'ja', hlsUrl: 'https://cdn.example.com/ja.m3u8' },
              { languageCode: 'en', hlsUrl: 'https://cdn.example.com/en.m3u8' },
            ],
          }),
        ],
      }),
    );
    expect(sections).toEqual([
      {
        kind: 'main',
        hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
        languageCode: null,
      },
      {
        kind: 'classroom',
        hlsUrl: 'https://cdn.example.com/ja.m3u8',
        languageCode: 'ja',
      },
      {
        kind: 'classroom',
        hlsUrl: 'https://cdn.example.com/en.m3u8',
        languageCode: 'en',
      },
    ]);
  });

  it('deduplicates classroom tracks that repeat a language', () => {
    const sections = buildPlaybackSections(
      episode({
        audioTracks: [
          track({
            classrooms: [
              {
                languageCode: 'ja',
                hlsUrl: 'https://cdn.example.com/ja-first.m3u8',
              },
              {
                languageCode: 'ja',
                hlsUrl: 'https://cdn.example.com/ja-second.m3u8',
              },
            ],
          }),
        ],
      }),
    );
    expect(sections.filter((section) => section.kind === 'classroom')).toEqual([
      {
        kind: 'classroom',
        hlsUrl: 'https://cdn.example.com/ja-first.m3u8',
        languageCode: 'ja',
      },
    ]);
  });

  it('gives the legacy combined classroom section a null language', () => {
    const sections = buildPlaybackSections(episode({}));
    expect(sections[1]).toEqual({
      kind: 'classroom',
      hlsUrl: 'https://cdn.example.com/classroom/playlist.m3u8',
      languageCode: null,
    });
  });
});

describe('nextPlaybackSection', () => {
  const twoSections = buildPlaybackSections(episode({}));
  const mainOnly = buildPlaybackSections(episode({ audioTracks: [] }));

  it('advances main -> classroom when a classroom section exists', () => {
    expect(nextPlaybackSection(twoSections, 'main')?.kind).toBe('classroom');
  });

  it('returns null after the classroom section', () => {
    expect(nextPlaybackSection(twoSections, 'classroom')).toBeNull();
  });

  it('returns null after main when there is no classroom section', () => {
    expect(nextPlaybackSection(mainOnly, 'main')).toBeNull();
  });

  it('walks the full main -> ja -> en -> end chain by (kind, languageCode) pair', () => {
    const sections = buildPlaybackSections(
      episode({
        audioTracks: [
          track({
            classrooms: [
              { languageCode: 'ja', hlsUrl: 'https://cdn.example.com/ja.m3u8' },
              { languageCode: 'en', hlsUrl: 'https://cdn.example.com/en.m3u8' },
            ],
          }),
        ],
      }),
    );

    const toJa = nextPlaybackSection(sections, 'main', null);
    expect(toJa).toEqual({
      kind: 'classroom',
      hlsUrl: 'https://cdn.example.com/ja.m3u8',
      languageCode: 'ja',
    });

    const toEn = nextPlaybackSection(sections, 'classroom', 'ja');
    expect(toEn).toEqual({
      kind: 'classroom',
      hlsUrl: 'https://cdn.example.com/en.m3u8',
      languageCode: 'en',
    });

    expect(nextPlaybackSection(sections, 'classroom', 'en')).toBeNull();
  });

  it('advances past the legacy combined classroom section (null language pair)', () => {
    expect(nextPlaybackSection(twoSections, 'main', null)?.languageCode).toBe(
      null,
    );
    expect(nextPlaybackSection(twoSections, 'classroom', null)).toBeNull();
  });
});

describe('findPlaybackSection', () => {
  const sections = buildPlaybackSections(
    episode({
      audioTracks: [
        track({
          classrooms: [
            { languageCode: 'ja', hlsUrl: 'https://cdn.example.com/ja.m3u8' },
            { languageCode: 'en', hlsUrl: 'https://cdn.example.com/en.m3u8' },
          ],
        }),
      ],
    }),
  );

  it('finds an exact (kind, languageCode) match', () => {
    expect(findPlaybackSection(sections, 'classroom', 'en')).toEqual({
      kind: 'classroom',
      hlsUrl: 'https://cdn.example.com/en.m3u8',
      languageCode: 'en',
    });
  });

  it('falls back to the first section of that kind when the language is omitted', () => {
    expect(findPlaybackSection(sections, 'classroom')?.languageCode).toBe('ja');
  });

  it('falls back to the first section of that kind when the language does not match any section', () => {
    expect(findPlaybackSection(sections, 'classroom', 'ko')?.languageCode).toBe(
      'ja',
    );
  });

  it('returns null when no section of that kind exists', () => {
    expect(
      findPlaybackSection(
        buildPlaybackSections(episode({ audioTracks: [] })),
        'classroom',
      ),
    ).toBeNull();
  });
});

describe('per-section speed preferences', () => {
  it('defaults classroom to 1.0x even when main is sped up', () => {
    const prefs = withSectionSpeed(
      DEFAULT_PODCAST_SPEED_PREFERENCES,
      'main',
      2,
    );
    expect(speedForSection(prefs, 'main')).toBe(2);
    expect(speedForSection(prefs, 'classroom')).toBe(1);
  });

  it('keeps main and classroom speeds independent', () => {
    let prefs = withSectionSpeed(
      DEFAULT_PODCAST_SPEED_PREFERENCES,
      'main',
      1.5,
    );
    prefs = withSectionSpeed(prefs, 'classroom', 0.8);
    expect(prefs).toEqual({ mainSpeed: 1.5, classroomSpeed: 0.8 });
  });

  it('parses corrupt, missing, or out-of-range stored values to safe defaults', () => {
    expect(parseStoredSpeedPreferences(null)).toEqual(
      DEFAULT_PODCAST_SPEED_PREFERENCES,
    );
    expect(parseStoredSpeedPreferences('nonsense')).toEqual(
      DEFAULT_PODCAST_SPEED_PREFERENCES,
    );
    expect(parseStoredSpeedPreferences({})).toEqual(
      DEFAULT_PODCAST_SPEED_PREFERENCES,
    );
    // Out-of-range and non-finite values clamp/fall back to 1.
    expect(
      parseStoredSpeedPreferences({ mainSpeed: 0, classroomSpeed: -3 }),
    ).toEqual({ mainSpeed: 1, classroomSpeed: 1 });
    expect(
      parseStoredSpeedPreferences({ mainSpeed: 99, classroomSpeed: 1.25 }),
    ).toEqual({ mainSpeed: 3, classroomSpeed: 1.25 });
  });
});
