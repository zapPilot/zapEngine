import { describe, expect, it } from 'vitest';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import {
  buildPlaybackSections,
  resolveFinishedPlayback,
} from '@/integration/podcastSections';

function makeEpisode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    id: 'article-1',
    localizationId: 'loc-1',
    title: 'Episode',
    languageCode: 'zh-Hant',
    hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
    createdAt: '2026-07-10T00:00:00.000Z',
    listened: false,
    likeCount: 0,
    script: null,
    video: null,
    audioTracks: [
      {
        languageCode: 'zh-Hant',
        title: 'Episode',
        hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
        classroomHlsUrl: 'https://cdn.example.com/classroom/playlist.m3u8',
      },
    ],
    languageClassrooms: [],
    lastPositionSeconds: 0,
    ...overrides,
  };
}

const withClassroom = makeEpisode({ localizationId: 'loc-1' });
const nextEpisode = makeEpisode({ localizationId: 'loc-2' });
const mainOnlyEpisode = makeEpisode({
  localizationId: 'loc-3',
  audioTracks: [
    {
      languageCode: 'zh-Hant',
      title: 'Episode',
      hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
      classroomHlsUrl: null,
    },
  ],
});

describe('resolveFinishedPlayback', () => {
  it('never advances to the next episode while a classroom section is pending (screen-off regression)', () => {
    const action = resolveFinishedPlayback({
      sections: buildPlaybackSections(withClassroom),
      currentSection: 'main',
      queue: [withClassroom, nextEpisode],
      queueIndex: 0,
    });
    expect(action).toEqual({
      type: 'playSection',
      section: {
        kind: 'classroom',
        hlsUrl: 'https://cdn.example.com/classroom/playlist.m3u8',
      },
    });
  });

  it('advances to the next episode after the classroom section finishes', () => {
    const action = resolveFinishedPlayback({
      sections: buildPlaybackSections(withClassroom),
      currentSection: 'classroom',
      queue: [withClassroom, nextEpisode],
      queueIndex: 0,
    });
    expect(action).toEqual({ type: 'nextEpisode' });
  });

  it('advances to the next episode when the current episode has no classroom section', () => {
    const action = resolveFinishedPlayback({
      sections: buildPlaybackSections(mainOnlyEpisode),
      currentSection: 'main',
      queue: [mainOnlyEpisode, nextEpisode],
      queueIndex: 0,
    });
    expect(action).toEqual({ type: 'nextEpisode' });
  });

  it('stops after the last section of the last queued episode', () => {
    const action = resolveFinishedPlayback({
      sections: buildPlaybackSections(withClassroom),
      currentSection: 'classroom',
      queue: [withClassroom],
      queueIndex: 0,
    });
    expect(action).toEqual({ type: 'stop' });
  });

  it('stops after a main-only episode at the end of the queue', () => {
    const action = resolveFinishedPlayback({
      sections: buildPlaybackSections(mainOnlyEpisode),
      currentSection: 'main',
      queue: [mainOnlyEpisode],
      queueIndex: 0,
    });
    expect(action).toEqual({ type: 'stop' });
  });
});
