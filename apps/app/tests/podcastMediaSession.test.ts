import { describe, expect, it, vi } from 'vitest';

import {
  buildMediaSessionPositionState,
  buildPodcastMediaMetadata,
  registerPodcastMediaSessionHandlers,
  resolvePodcastRemoteCommand,
  type PodcastMediaSessionHandlers,
} from '@/integration/podcastMediaSession';
import { createPodcastEpisodeFactory } from './support/podcastEpisode';

const makeEpisode = createPodcastEpisodeFactory({
  id: 'article-1',
  localizationId: 'loc-zh-1',
  title: 'Fed holds rates',
});

function createHandlers(): PodcastMediaSessionHandlers {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    seekBackward: vi.fn(),
    seekForward: vi.fn(),
    nextTrack: vi.fn(),
    previousTrack: vi.fn(),
  };
}

function createMediaSession() {
  const handlers = new Map<string, (() => void) | null>();
  return {
    handlers,
    setActionHandler: vi.fn((action: string, handler: (() => void) | null) => {
      handlers.set(action, handler);
    }),
  };
}

describe('buildPodcastMediaMetadata', () => {
  it('labels the classroom section so the lock screen distinguishes it', () => {
    const episode = makeEpisode();

    expect(buildPodcastMediaMetadata(episode, 'main')).toEqual({
      title: 'Fed holds rates',
      artist: 'From Fed to Chain',
    });
    expect(buildPodcastMediaMetadata(episode, 'classroom')).toEqual({
      title: 'Fed holds rates — Language Classroom',
      artist: 'From Fed to Chain',
    });
  });

  it('uses the generated video thumbnail as artwork when there is one', () => {
    const episode = makeEpisode({
      video: {
        url: 'https://example.com/video.mp4',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        durationSeconds: 120,
      },
    });

    expect(buildPodcastMediaMetadata(episode, 'main').artworkUrl).toBe(
      'https://example.com/thumb.jpg',
    );
  });

  it('omits artwork rather than sending a blank url', () => {
    const withoutVideo = buildPodcastMediaMetadata(makeEpisode(), 'main');
    const withBlankThumbnail = buildPodcastMediaMetadata(
      makeEpisode({
        video: {
          url: 'https://example.com/video.mp4',
          thumbnailUrl: '',
          durationSeconds: 120,
        },
      }),
      'main',
    );

    expect(withoutVideo).not.toHaveProperty('artworkUrl');
    expect(withBlankThumbnail).not.toHaveProperty('artworkUrl');
  });
});

describe('resolvePodcastRemoteCommand', () => {
  it('accepts the two commands the patched native module emits', () => {
    expect(resolvePodcastRemoteCommand({ command: 'nextTrack' })).toBe(
      'nextTrack',
    );
    expect(resolvePodcastRemoteCommand({ command: 'previousTrack' })).toBe(
      'previousTrack',
    );
  });

  it('returns null for anything else crossing the bridge', () => {
    expect(resolvePodcastRemoteCommand(null)).toBeNull();
    expect(resolvePodcastRemoteCommand(undefined)).toBeNull();
    expect(resolvePodcastRemoteCommand('nextTrack')).toBeNull();
    expect(resolvePodcastRemoteCommand({})).toBeNull();
    expect(resolvePodcastRemoteCommand({ command: 'seekToEnd' })).toBeNull();
    expect(resolvePodcastRemoteCommand({ command: 3 })).toBeNull();
  });
});

describe('registerPodcastMediaSessionHandlers', () => {
  it('registers every transport action, including track navigation', () => {
    const mediaSession = createMediaSession();

    registerPodcastMediaSessionHandlers(mediaSession, createHandlers());

    expect([...mediaSession.handlers.keys()]).toEqual([
      'play',
      'pause',
      'seekbackward',
      'seekforward',
      'nexttrack',
      'previoustrack',
    ]);
  });

  it('routes each action to its handler', () => {
    const mediaSession = createMediaSession();
    const handlers = createHandlers();

    registerPodcastMediaSessionHandlers(mediaSession, handlers);
    mediaSession.handlers.get('nexttrack')?.();
    mediaSession.handlers.get('previoustrack')?.();
    mediaSession.handlers.get('play')?.();

    expect(handlers.nextTrack).toHaveBeenCalledTimes(1);
    expect(handlers.previousTrack).toHaveBeenCalledTimes(1);
    expect(handlers.play).toHaveBeenCalledTimes(1);
    expect(handlers.pause).not.toHaveBeenCalled();
  });

  it('clears the handlers it registered on cleanup', () => {
    const mediaSession = createMediaSession();

    registerPodcastMediaSessionHandlers(mediaSession, createHandlers())();

    expect([...mediaSession.handlers.values()]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('keeps the supported actions when the user agent rejects one', () => {
    const mediaSession = createMediaSession();
    mediaSession.setActionHandler.mockImplementation(
      (action: string, handler: (() => void) | null) => {
        if (action === 'nexttrack') {
          throw new TypeError('Unsupported action');
        }
        mediaSession.handlers.set(action, handler);
      },
    );

    const cleanup = registerPodcastMediaSessionHandlers(
      mediaSession,
      createHandlers(),
    );

    expect([...mediaSession.handlers.keys()]).toEqual([
      'play',
      'pause',
      'seekbackward',
      'seekforward',
      'previoustrack',
    ]);

    cleanup();
    expect([...mediaSession.handlers.values()]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('buildMediaSessionPositionState', () => {
  it('reports the current position within the section', () => {
    expect(buildMediaSessionPositionState(30, 300, 1.5)).toEqual({
      duration: 300,
      playbackRate: 1.5,
      position: 30,
    });
  });

  it('clamps a position past the end, which the spec rejects', () => {
    expect(buildMediaSessionPositionState(400, 300, 1)).toMatchObject({
      position: 300,
    });
    expect(buildMediaSessionPositionState(-5, 300, 1)).toMatchObject({
      position: 0,
    });
    expect(buildMediaSessionPositionState(Number.NaN, 300, 1)).toMatchObject({
      position: 0,
    });
  });

  it('falls back to 1x when the speed is not a usable rate', () => {
    expect(buildMediaSessionPositionState(0, 300, 0)).toMatchObject({
      playbackRate: 1,
    });
    expect(buildMediaSessionPositionState(0, 300, Number.NaN)).toMatchObject({
      playbackRate: 1,
    });
  });

  it('returns null while the duration is still unknown', () => {
    expect(buildMediaSessionPositionState(0, 0, 1)).toBeNull();
    expect(buildMediaSessionPositionState(0, Number.NaN, 1)).toBeNull();
    expect(buildMediaSessionPositionState(0, Infinity, 1)).toBeNull();
  });
});
