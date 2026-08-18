import { describe, expect, it } from 'vitest';

import {
  buildPlaybackSections,
  resolveFinishedPlayback,
} from '@/integration/podcastSections';
import { createPodcastEpisodeFactory } from './support/podcastEpisode';

const makeEpisode = createPodcastEpisodeFactory({
  id: 'article-1',
  localizationId: 'loc-1',
  hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
  audioTracks: [
    {
      languageCode: 'zh-Hant',
      title: 'Episode',
      hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
      classroomHlsUrl: 'https://cdn.example.com/classroom/playlist.m3u8',
      classrooms: [],
    },
  ],
});

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
      classrooms: [],
    },
  ],
});
const withTwoClassroomLanguages = makeEpisode({
  localizationId: 'loc-4',
  audioTracks: [
    {
      languageCode: 'zh-Hant',
      title: 'Episode',
      hlsUrl: 'https://cdn.example.com/main/playlist.m3u8',
      classroomHlsUrl: null,
      classrooms: [
        { languageCode: 'ja', hlsUrl: 'https://cdn.example.com/ja.m3u8' },
        { languageCode: 'en', hlsUrl: 'https://cdn.example.com/en.m3u8' },
      ],
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
        languageCode: null,
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

  it('advances main -> the first classroom language for a multi-language episode', () => {
    const action = resolveFinishedPlayback({
      sections: buildPlaybackSections(withTwoClassroomLanguages),
      currentSection: 'main',
      currentSectionLanguage: null,
      queue: [withTwoClassroomLanguages, nextEpisode],
      queueIndex: 0,
    });
    expect(action).toEqual({
      type: 'playSection',
      section: {
        kind: 'classroom',
        hlsUrl: 'https://cdn.example.com/ja.m3u8',
        languageCode: 'ja',
      },
    });
  });

  it('never skips to the next episode between classroom languages (N-language screen-off regression)', () => {
    const action = resolveFinishedPlayback({
      sections: buildPlaybackSections(withTwoClassroomLanguages),
      currentSection: 'classroom',
      currentSectionLanguage: 'ja',
      queue: [withTwoClassroomLanguages, nextEpisode],
      queueIndex: 0,
    });
    expect(action).toEqual({
      type: 'playSection',
      section: {
        kind: 'classroom',
        hlsUrl: 'https://cdn.example.com/en.m3u8',
        languageCode: 'en',
      },
    });
  });

  it('advances to the next episode once the last classroom language finishes', () => {
    const action = resolveFinishedPlayback({
      sections: buildPlaybackSections(withTwoClassroomLanguages),
      currentSection: 'classroom',
      currentSectionLanguage: 'en',
      queue: [withTwoClassroomLanguages, nextEpisode],
      queueIndex: 0,
    });
    expect(action).toEqual({ type: 'nextEpisode' });
  });

  it('stops after the last classroom language of the last queued episode', () => {
    const action = resolveFinishedPlayback({
      sections: buildPlaybackSections(withTwoClassroomLanguages),
      currentSection: 'classroom',
      currentSectionLanguage: 'en',
      queue: [withTwoClassroomLanguages],
      queueIndex: 0,
    });
    expect(action).toEqual({ type: 'stop' });
  });
});
