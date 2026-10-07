// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { EpisodeVideoPlayer } from '@/components/podcast/EpisodeVideoPlayer';
import { handoffAudioToVideo } from '@/integration/episodeMediaSync';

const mock = vi.hoisted(() => ({
  player: {
    status: 'readyToPlay',
    duration: 180,
    currentTime: 0,
    playbackRate: 1,
    timeUpdateEventInterval: 0,
    showNowPlayingNotification: false,
    staysActiveInBackground: false,
    play: vi.fn(),
    pause: vi.fn(),
  },
  source: null as unknown,
  listeners: {} as Record<string, (payload: never) => void>,
  release: null as null | (() => void),
}));
vi.mock('expo-video', () => ({
  useVideoPlayer: (
    source: unknown,
    setup: (player: typeof mock.player) => void,
  ) => {
    mock.source = source;
    setup(mock.player);
    return mock.player;
  },
  VideoView: () => null,
}));
vi.mock('expo', () => ({
  useEvent: () => ({ status: 'readyToPlay' }),
  useEventListener: (
    _player: unknown,
    name: string,
    listener: (payload: never) => void,
  ) => {
    mock.listeners[name] = listener;
  },
}));
vi.mock('react-native', () => ({
  View: 'div',
  Image: 'img',
  ActivityIndicator: () => null,
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('@/providers/VideoPlaybackCoordinatorProvider', () => ({
  useVideoPlaybackCoordinator: () => ({
    registerVideo: (release: () => void) => {
      mock.release = release;
      return vi.fn();
    },
  }),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mock.listeners = {};
  mock.player.showNowPlayingNotification = false;
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

it('acquires Now Playing with metadata and starts at the handed-off audio clock', () => {
  const pauseAudio = vi.fn();
  const session = handoffAudioToVideo({
    audioTimeSeconds: 37,
    videoDurationSeconds: 180,
    playbackRate: 1.25,
    shouldPlay: true,
    pauseAudio,
  });
  const onRemoteCommand = vi.fn();
  act(() =>
    root.render(
      createElement(EpisodeVideoPlayer, {
        title: 'Episode title',
        video: {
          url: 'https://example.com/video.mp4',
          thumbnailUrl: 'https://example.com/art.jpg',
          durationSeconds: 180,
        },
        ...session,
        onRemoteCommand,
        onPlayingChange: vi.fn(),
        onPlaybackRateChange: vi.fn(),
        onTimeUpdate: vi.fn(),
        onPlaybackEnd: vi.fn(),
        onPlaybackError: vi.fn(),
        onPlaybackExit: vi.fn(),
      }),
    ),
  );
  expect(pauseAudio).toHaveBeenCalledOnce();
  expect(mock.player.showNowPlayingNotification).toBe(true);
  expect(mock.player.staysActiveInBackground).toBe(true);
  expect(mock.source).toMatchObject({
    metadata: {
      title: 'Episode title',
      artwork: 'https://example.com/art.jpg',
    },
  });
  act(() => mock.listeners.sourceLoad?.({ duration: 180 } as never));
  expect(mock.player.currentTime).toBe(37);
  expect(mock.player.playbackRate).toBe(1.25);
  expect(mock.player.play).not.toHaveBeenCalled();
  act(() => mock.listeners.timeUpdate?.({ currentTime: 37 } as never));
  expect(mock.player.play).toHaveBeenCalledOnce();
  for (const command of ['nextTrack', 'previousTrack']) {
    act(() => mock.listeners.lockScreenRemoteCommand?.({ command } as never));
    expect(onRemoteCommand).toHaveBeenCalledWith(command);
  }
  act(() => mock.listeners.sourceLoad?.({ duration: 180 } as never));
  act(() => mock.release?.());
  expect(mock.player.pause).toHaveBeenCalled();
  expect(mock.player.showNowPlayingNotification).toBe(false);
  mock.player.play.mockClear();
  act(() => mock.listeners.sourceLoad?.({ duration: 180 } as never));
  act(() => mock.listeners.timeUpdate?.({ currentTime: 37 } as never));
  act(() => vi.advanceTimersByTime(2000));
  expect(mock.player.play).not.toHaveBeenCalled();
});
