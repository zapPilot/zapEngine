import { describe, expect, it } from 'vitest';

import {
  episodeMediaTabAvailability,
  episodeVideoPanelState,
  resolveActiveEpisodeMediaTab,
  type EpisodeMediaTab,
} from '@/integration/episodeMediaTabs';
import type { PodcastAudioTrack } from '@/integration/podcastFeed';
import { createPodcastEpisodeFactory } from './support/podcastEpisode';

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

const episode = createPodcastEpisodeFactory({
  hlsUrl: 'https://cdn.example.com/main.m3u8',
  createdAt: '2026-07-28T00:00:00.000Z',
  audioTracks: [audioTrack()],
});

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

describe('episodeVideoPanelState', () => {
  it('reports ready whenever the episode has a playable video', () => {
    expect(
      episodeVideoPanelState(
        episode({
          video: {
            url: 'https://cdn.example.com/video.mp4',
            thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
            durationSeconds: 90,
          },
          videoGeneration: { status: 'failed', updatedAt: null },
        }),
      ),
    ).toBe('ready');
  });

  it.each(['queued', 'processing'] as const)(
    'reports generating for a %s video job',
    (status) => {
      expect(
        episodeVideoPanelState(
          episode({
            video: null,
            videoGeneration: { status, updatedAt: null },
          }),
        ),
      ).toBe('generating');
    },
  );

  it('still reports generating when progress fields are populated', () => {
    // Progress rides alongside this state as a separate payload; the panel needs
    // a payload, not a fifth state, so nothing here may shift.
    expect(
      episodeVideoPanelState(
        episode({
          video: null,
          videoGeneration: {
            status: 'queued',
            updatedAt: null,
            progressPercent: 22,
            stage: 'selecting-images',
          },
        }),
      ),
    ).toBe('generating');
  });

  it('reports failed for a failed video job', () => {
    expect(
      episodeVideoPanelState(
        episode({
          video: null,
          videoGeneration: { status: 'failed', updatedAt: null },
        }),
      ),
    ).toBe('failed');
  });

  it('reports unavailable without a job or when completed assets are absent', () => {
    expect(episodeVideoPanelState(episode())).toBe('unavailable');
    expect(
      episodeVideoPanelState(
        episode({
          video: null,
          videoGeneration: { status: 'completed', updatedAt: null },
        }),
      ),
    ).toBe('unavailable');
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
