// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EpisodeMediaPlayer } from '@/components/podcast/EpisodeMediaPlayer';
import type { EpisodeVideoPlayer } from '@/components/podcast/EpisodeVideoPlayer';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { createPodcastEpisodeFactory } from './support/podcastEpisode';

const state = vi.hoisted(() => ({
  video: null as ComponentProps<typeof EpisodeVideoPlayer> | null,
}));
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  ActivityIndicator: () => null,
  Platform: { OS: 'ios' },
  AccessibilityInfo: { announceForAccessibility: vi.fn() },
}));
vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock('@react-native-community/slider', () => ({ default: () => null }));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/Button', () => ({ Button: () => null }));
vi.mock('@/components/ui/Callout', () => ({ Callout: () => null }));
vi.mock('@/components/ui/ProgressBar', () => ({ ProgressBar: () => null }));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    t: (key: string) => (key === 'podcast.video' ? 'Video' : key),
  }),
}));
vi.mock('@/providers/PodcastDownloadsProvider', () => ({
  usePodcastDownloads: () => ({ records: [], localUri: vi.fn() }),
}));
vi.mock('@/providers/PodcastProgressProvider', () => ({
  useEpisodeProgress: () => ({ markListened: vi.fn(), setPosition: vi.fn() }),
}));
vi.mock('@/components/podcast/EpisodeVideoPlayer', () => ({
  EpisodeVideoPlayer: (props: ComponentProps<typeof EpisodeVideoPlayer>) => {
    state.video = props;
    return null;
  },
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  state.video = null;
});

it('hands active Story transport to video, navigates with the shared queue, and falls back at the video clock', () => {
  const makeEpisode = createPodcastEpisodeFactory({});
  const episode = makeEpisode({
    video: {
      url: 'https://example.com/video.mp4',
      thumbnailUrl: 'https://example.com/art.jpg',
      durationSeconds: 180,
    },
  });
  const nextEpisode = makeEpisode({ localizationId: 'next' });
  const pause = vi.fn();
  const playSectionFromQueue = vi.fn();
  const skipToNextEpisode = vi.fn(() => nextEpisode);
  const skipToPreviousEpisode = vi.fn(() => episode);
  const player = {
    nowPlaying: episode,
    currentSection: 'main',
    currentSectionLanguage: null,
    currentTime: 37,
    duration: 180,
    isPlaying: true,
    speed: 1.25,
    hasNextEpisode: true,
    hasPreviousEpisode: true,
    pause,
    playSectionFromQueue,
    skipToNextEpisode,
    skipToPreviousEpisode,
    setSpeed: vi.fn(),
  } as unknown as PodcastPlayer;
  const onEpisodeChanged = vi.fn();
  const episodes = [episode, nextEpisode];
  const container = document.createElement('div');
  root = createRoot(container);
  act(() =>
    root?.render(
      <EpisodeMediaPlayer
        episode={episode}
        episodes={episodes}
        player={player}
        onEpisodeChanged={onEpisodeChanged}
      />,
    ),
  );
  act(() =>
    container.querySelector<HTMLButtonElement>('[aria-label="Video"]')?.click(),
  );
  expect(pause).toHaveBeenCalledWith({ releaseMediaSession: true });
  expect(state.video).toMatchObject({
    initialTimeSeconds: 37,
    playbackRate: 1.25,
    shouldPlay: true,
  });
  act(() => state.video?.onRemoteCommand('nextTrack'));
  expect(skipToNextEpisode).toHaveBeenCalledOnce();
  expect(onEpisodeChanged).toHaveBeenCalledWith(nextEpisode);
  act(() => state.video?.onRemoteCommand('previousTrack'));
  expect(skipToPreviousEpisode).toHaveBeenCalledOnce();
  player.hasNextEpisode = false;
  act(() => state.video?.onRemoteCommand('nextTrack'));
  expect(skipToNextEpisode).toHaveBeenCalledOnce();
  act(() => {
    state.video?.onTimeUpdate(52, 180);
    state.video?.onPlaybackError();
  });
  expect(playSectionFromQueue).toHaveBeenCalledWith(episodes, episode, 'main', {
    atSeconds: 52,
    shouldPlay: true,
    languageCode: null,
  });
});
