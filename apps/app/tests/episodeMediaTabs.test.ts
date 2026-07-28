import { describe, expect, it } from 'vitest';

import {
  episodeMediaTabAvailability,
  resolveActiveEpisodeMediaTab,
  type EpisodeMediaTab,
} from '@/integration/episodeMediaTabs';
import type {
  PodcastAudioTrack,
  PodcastEpisode,
} from '@/integration/podcastFeed';

function audioTrack(
  overrides: Partial<PodcastAudioTrack> = {},
): PodcastAudioTrack {
  return {
    languageCode: 'zh-Hant',
    title: 'Episode',
    hlsUrl: 'https://cdn.example.com/main.m3u8',
    classroomHlsUrl: 'https://cdn.example.com/classroom.m3u8',
    ...overrides,
  };
}

function episode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    id: 'episode-1',
    localizationId: 'episode-1-zh-Hant',
    title: 'Episode',
    languageCode: 'zh-Hant',
    hlsUrl: 'https://cdn.example.com/main.m3u8',
    createdAt: '2026-07-28T00:00:00.000Z',
    listened: false,
    likeCount: 0,
    script: null,
    video: null,
    audioTracks: [audioTrack()],
    languageClassrooms: [],
    lastPositionSeconds: 0,
    ...overrides,
  };
}

describe('episodeMediaTabAvailability', () => {
  it('always exposes Story and enables media backed by the displayed episode', () => {
    expect(
      episodeMediaTabAvailability(
        episode({
          video: {
            url: 'https://cdn.example.com/video.mp4',
            thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
            durationSeconds: 90,
          },
        }),
      ),
    ).toEqual({
      story: true,
      classroom: true,
      video: true,
    });
  });

  it.each([null, '', '   '])(
    'disables Classroom for an unavailable classroom URL (%s)',
    (classroomHlsUrl) => {
      expect(
        episodeMediaTabAvailability(
          episode({
            audioTracks: [audioTrack({ classroomHlsUrl })],
          }),
        ),
      ).toEqual({
        story: true,
        classroom: false,
        video: false,
      });
    },
  );

  it('disables Classroom when the displayed episode has no audio tracks', () => {
    expect(episodeMediaTabAvailability(episode({ audioTracks: [] }))).toEqual({
      story: true,
      classroom: false,
      video: false,
    });
  });

  it('uses the audio track matching the displayed episode HLS URL', () => {
    expect(
      episodeMediaTabAvailability(
        episode({
          languageCode: 'ja',
          hlsUrl: 'https://cdn.example.com/ja/main.m3u8',
          audioTracks: [
            audioTrack({
              languageCode: 'zh-Hant',
              hlsUrl: 'https://cdn.example.com/zh/main.m3u8',
              classroomHlsUrl: null,
            }),
            audioTrack({
              languageCode: 'ja',
              hlsUrl: 'https://cdn.example.com/ja/main.m3u8',
              classroomHlsUrl: 'https://cdn.example.com/ja/classroom.m3u8',
            }),
          ],
        }),
      ).classroom,
    ).toBe(true);
  });

  it('disables Video when the displayed episode has no completed video', () => {
    expect(episodeMediaTabAvailability(episode()).video).toBe(false);
  });
});

describe('resolveActiveEpisodeMediaTab', () => {
  it('uses Video while the video player is active', () => {
    expect(
      resolveActiveEpisodeMediaTab({
        selectedTab: 'story',
        isCurrentAudio: true,
        currentSection: 'classroom',
        isVideoActive: true,
      }),
    ).toBe('video');
  });

  it.each([
    ['story', 'story'],
    ['classroom', 'story'],
    ['video', 'story'],
  ] as const)(
    'syncs selected %s to Story while the current main audio is active',
    (selectedTab, expected) => {
      expect(
        resolveActiveEpisodeMediaTab({
          selectedTab,
          isCurrentAudio: true,
          currentSection: 'main',
          isVideoActive: false,
        }),
      ).toBe(expected);
    },
  );

  it.each([
    ['story', 'classroom'],
    ['classroom', 'classroom'],
    ['video', 'classroom'],
  ] as const)(
    'syncs selected %s to Classroom while the current classroom audio is active',
    (selectedTab, expected) => {
      expect(
        resolveActiveEpisodeMediaTab({
          selectedTab,
          isCurrentAudio: true,
          currentSection: 'classroom',
          isVideoActive: false,
        }),
      ).toBe(expected);
    },
  );

  it.each<EpisodeMediaTab>(['story', 'classroom', 'video'])(
    'preserves the locally selected %s tab when this episode has no active audio',
    (selectedTab) => {
      expect(
        resolveActiveEpisodeMediaTab({
          selectedTab,
          isCurrentAudio: false,
          currentSection: 'main',
          isVideoActive: false,
        }),
      ).toBe(selectedTab);
    },
  );

  it('preserves a locally selected unavailable Video tab', () => {
    const displayedEpisode = episode({ video: null });
    expect(episodeMediaTabAvailability(displayedEpisode).video).toBe(false);
    expect(
      resolveActiveEpisodeMediaTab({
        selectedTab: 'video',
        isCurrentAudio: false,
        currentSection: 'main',
        isVideoActive: false,
      }),
    ).toBe('video');
  });
});
