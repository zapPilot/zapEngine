// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EpisodeTranscript } from '@/components/podcast/EpisodeTranscript';
import type { EpisodeMediaClock } from '@/integration/episodeMediaSync';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { createPodcastEpisode } from './support/podcastEpisode';

const longPressHandlers = vi.hoisted(() => [] as (() => void)[]);

vi.mock('react-native', () => ({
  Text: ({
    children,
    selectable,
  }: {
    children?: ReactNode;
    selectable?: boolean;
  }) => <span data-selectable={selectable}>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    onPress,
    onLongPress,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    onLongPress?: () => void;
  }) => {
    if (onLongPress) longPressHandlers.push(onLongPress);
    return (
      <button
        onClick={onPress}
        data-has-long-press={typeof onLongPress === 'function'}
      >
        {children}
      </button>
    );
  },
}));

const episode = createPodcastEpisode({ script: 'First part.\n\nOther part.' });
let container: HTMLDivElement;
let root: Root;
let player: PodcastPlayer;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  longPressHandlers.length = 0;
  player = {
    nowPlaying: episode,
    isPlaying: true,
    currentTime: 0,
    duration: 60,
    speed: 1,
    sections: [],
    currentSection: 'main',
    currentSectionLanguage: null,
    queue: [],
    queueIndex: -1,
    hasPreviousEpisode: false,
    hasNextEpisode: false,
    pause: vi.fn(),
    toggle: vi.fn(),
    playFromQueue: vi.fn(),
    playFromQueueAt: vi.fn(),
    playSectionFromQueue: vi.fn(),
    seek: vi.fn(),
    seekRelative: vi.fn(),
    skipToPreviousEpisode: vi.fn(),
    skipToNextEpisode: vi.fn(),
    skipToSection: vi.fn(),
    setSpeed: vi.fn(),
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(activeVideoClock: EpisodeMediaClock | null = null) {
  await act(async () =>
    root.render(
      <EpisodeTranscript
        episode={episode}
        player={player}
        activeVideoClock={activeVideoClock}
      />,
    ),
  );
}

describe('EpisodeTranscript', () => {
  it('makes the full transcript selectable when another episode is active', async () => {
    player.nowPlaying = createPodcastEpisode({ id: 'other' });
    await render();
    expect(
      container.querySelector('[data-selectable="true"]')?.textContent,
    ).toBe(episode.script);
    expect(container.querySelector('button')).toBeNull();
  });

  it('uses selectable fallback before duration is available', async () => {
    player.duration = 0;
    await render();
    expect(
      container.querySelector('[data-selectable="true"]')?.textContent,
    ).toBe(episode.script);
    expect(container.querySelector('button')).toBeNull();
  });

  it('selects segment text, leaves timestamps unselectable, and supplies the Pressability long-press contract', async () => {
    await render();
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    for (const [index, button] of Array.from(buttons).entries()) {
      const texts = button.querySelectorAll('span');
      expect(texts[0]?.hasAttribute('data-selectable')).toBe(false);
      expect(texts[1]?.getAttribute('data-selectable')).toBe('true');
      expect(texts[1]?.textContent).toBe(
        index === 0 ? 'First part.' : 'Other part.',
      );
      expect(button.getAttribute('data-has-long-press')).toBe('true');
    }
    expect(longPressHandlers).toHaveLength(2);
    expect(longPressHandlers[0]).toBe(longPressHandlers[1]);
    for (const handler of longPressHandlers) handler();
    expect(player.seek).not.toHaveBeenCalled();
    expect(player.toggle).not.toHaveBeenCalled();
    await act(async () => buttons[1]?.click());
    expect(player.seek).toHaveBeenCalledWith(30);
    expect(player.toggle).not.toHaveBeenCalled();
  });

  it('starts this episode and seeks on a short press while video provides the clock', async () => {
    player.nowPlaying = createPodcastEpisode({ id: 'other' });
    await render({ currentTimeSeconds: 0, durationSeconds: 60 });
    await act(async () => container.querySelectorAll('button')[1]?.click());
    expect(player.toggle).toHaveBeenCalledWith(episode);
    expect(player.seek).toHaveBeenCalledWith(30);
  });
});
