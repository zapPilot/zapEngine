// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NowPlayingBar } from '@/components/podcast/NowPlayingBar';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { createPodcastEpisode } from './support/podcastEpisode';

vi.mock('lucide-react-native', () => ({
  Pause: () => null,
  Play: () => null,
}));

vi.mock('react-native', () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    accessibilityLabel,
    children,
    onPress,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
    onPress?: () => void;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress} type="button">
      {children}
    </button>
  ),
}));

vi.mock('@react-native-community/slider', () => ({
  default: ({
    accessibilityLabel,
    onSlidingComplete,
  }: {
    accessibilityLabel?: string;
    onSlidingComplete: (seconds: number) => void;
  }) => (
    <button
      aria-label={accessibilityLabel}
      onClick={() => onSlidingComplete(42)}
      type="button"
    />
  ),
}));

vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    t: (key: string, params?: Readonly<Record<string, string | number>>) => {
      if (key === 'podcast.openEpisode') return `Open ${params?.title}`;
      if (key === 'common.seek') return 'Seek';
      if (key === 'common.pause') return 'Pause';
      if (key === 'common.play') return 'Play';
      if (key === 'podcast.classroom') return 'Classroom';
      return key;
    },
  }),
}));

const episode = createPodcastEpisode({ title: 'Now playing episode' });

function createPlayer(): PodcastPlayer {
  return {
    nowPlaying: episode,
    isPlaying: true,
    currentTime: 24,
    duration: 120,
    speed: 1,
    sections: [],
    currentSection: 'main',
    queue: [episode],
    queueIndex: 0,
    hasPreviousEpisode: false,
    hasNextEpisode: false,
    pause: vi.fn(),
    toggle: vi.fn(),
    playFromQueue: vi.fn(),
    playFromQueueAt: vi.fn(),
    playSectionFromQueue: vi.fn(),
    seek: vi.fn(),
    seekRelative: vi.fn(),
    skipToPreviousEpisode: vi.fn(() => null),
    skipToNextEpisode: vi.fn(() => null),
    skipToSection: vi.fn(),
    setSpeed: vi.fn(),
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('NowPlayingBar', () => {
  it('opens the current episode from its information area', async () => {
    const player = createPlayer();
    const onOpen = vi.fn();

    await act(async () =>
      root.render(<NowPlayingBar {...{ player, onOpen }} />),
    );
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Open Now playing episode"]',
      )
      ?.click();

    expect(onOpen).toHaveBeenCalledWith(episode);
    expect(player.toggle).not.toHaveBeenCalled();
    expect(player.seek).not.toHaveBeenCalled();
  });

  it('keeps playback and seek controls independent from navigation', async () => {
    const player = createPlayer();
    const onOpen = vi.fn();

    await act(async () =>
      root.render(<NowPlayingBar {...{ player, onOpen }} />),
    );
    container.querySelector<HTMLButtonElement>('[aria-label="Pause"]')?.click();
    container.querySelector<HTMLButtonElement>('[aria-label="Seek"]')?.click();

    expect(player.toggle).toHaveBeenCalledWith(episode);
    expect(player.seek).toHaveBeenCalledWith(42);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
