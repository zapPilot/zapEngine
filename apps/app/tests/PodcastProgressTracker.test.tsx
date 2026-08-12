// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PodcastProgressTracker } from '@/components/podcast/PodcastProgressTracker';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import type { PodcastProgressContextValue } from '@/providers/PodcastProgressProvider';

const appStateMock = vi.hoisted(() => {
  const listeners = new Set<(state: string) => void>();
  return {
    listeners,
    addEventListener: vi.fn(
      (_event: string, listener: (state: string) => void) => {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
      },
    ),
    emit(state: string) {
      for (const listener of listeners) listener(state);
    },
  };
});

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: appStateMock.addEventListener,
  },
}));

let player: PodcastPlayer;
let progressContext: PodcastProgressContextValue;

vi.mock('@/providers/PodcastPlayerProvider', () => ({
  usePodcastPlayer: () => player,
}));
vi.mock('@/providers/PodcastProgressProvider', () => ({
  useEpisodeProgress: () => progressContext,
}));

const episode: PodcastEpisode = {
  id: 'article-1',
  localizationId: 'episode',
  title: 'Episode',
  languageCode: 'zh-Hant',
  hlsUrl: 'https://example.com/main.m3u8',
  createdAt: '2026-07-10T00:00:00.000Z',
  listened: false,
  likeCount: 0,
  script: null,
  video: null,
  videoGeneration: null,
  audioTracks: [],
  languageClassrooms: [],
  lastPositionSeconds: 0,
};

function makePlayer(overrides: Partial<PodcastPlayer> = {}): PodcastPlayer {
  return {
    nowPlaying: episode,
    isPlaying: true,
    currentTime: 0,
    duration: 300,
    speed: 1,
    sections: [{ kind: 'main', hlsUrl: episode.hlsUrl }],
    currentSection: 'main',
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
    skipToPreviousEpisode: vi.fn(() => null),
    skipToNextEpisode: vi.fn(() => null),
    skipToSection: vi.fn(),
    setSpeed: vi.fn(),
    ...overrides,
  };
}

let root: Root;
let container: HTMLDivElement;

function renderTracker(): void {
  act(() => root.render(<PodcastProgressTracker />));
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  appStateMock.listeners.clear();
  appStateMock.addEventListener.mockClear();
  player = makePlayer();
  progressContext = {
    progress: {},
    isHydrated: true,
    markListened: vi.fn(),
    setPosition: vi.fn(),
    markAllListened: vi.fn(),
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PodcastProgressTracker persistence lifecycle', () => {
  it('persists every ten seconds and flushes the latest background position', () => {
    renderTracker();
    player = makePlayer({ currentTime: 11 });
    renderTracker();
    expect(progressContext.setPosition).toHaveBeenLastCalledWith(
      'episode',
      11,
      'main',
    );

    player = makePlayer({ currentTime: 17 });
    renderTracker();
    expect(progressContext.setPosition).toHaveBeenCalledTimes(1);

    act(() => appStateMock.emit('background'));
    expect(progressContext.setPosition).toHaveBeenLastCalledWith(
      'episode',
      17,
      'main',
    );
  });

  it('flushes on pause, section switch, and unmount', () => {
    player = makePlayer({ currentTime: 7 });
    renderTracker();

    player = makePlayer({ currentTime: 8, isPlaying: false });
    renderTracker();
    expect(progressContext.setPosition).toHaveBeenLastCalledWith(
      'episode',
      8,
      'main',
    );

    player = makePlayer({
      currentTime: 3,
      currentSection: 'classroom',
      sections: [
        { kind: 'main', hlsUrl: episode.hlsUrl },
        { kind: 'classroom', hlsUrl: 'https://example.com/classroom.m3u8' },
      ],
    });
    renderTracker();
    expect(progressContext.setPosition).toHaveBeenCalledWith(
      'episode',
      3,
      'classroom',
    );

    player = makePlayer({
      currentTime: 6,
      currentSection: 'classroom',
      sections: [
        { kind: 'main', hlsUrl: episode.hlsUrl },
        { kind: 'classroom', hlsUrl: 'https://example.com/classroom.m3u8' },
      ],
    });
    renderTracker();
    act(() => root.unmount());
    expect(progressContext.setPosition).toHaveBeenLastCalledWith(
      'episode',
      6,
      'classroom',
    );
    root = createRoot(container);
  });
});

describe('PodcastProgressTracker completion', () => {
  it('marks an episode completed only after its final section finishes', () => {
    const sections = [
      { kind: 'main' as const, hlsUrl: episode.hlsUrl },
      {
        kind: 'classroom' as const,
        hlsUrl: 'https://example.com/classroom.m3u8',
      },
    ];

    player = makePlayer({
      currentTime: 298,
      duration: 300,
      currentSection: 'main',
      sections,
    });
    renderTracker();
    expect(progressContext.markListened).not.toHaveBeenCalled();

    player = makePlayer({
      currentTime: 88,
      duration: 90,
      currentSection: 'classroom',
      sections,
    });
    renderTracker();
    expect(progressContext.markListened).toHaveBeenCalledWith('episode', true);
  });

  it('completes a long episode at the capped thirty-second threshold', () => {
    player = makePlayer({ currentTime: 3569, duration: 3600 });
    renderTracker();
    expect(progressContext.markListened).not.toHaveBeenCalled();

    player = makePlayer({ currentTime: 3570, duration: 3600 });
    renderTracker();
    expect(progressContext.markListened).toHaveBeenCalledWith('episode', true);
  });
});

describe('PodcastProgressTracker resume', () => {
  it('waits for hydration before resuming the main section', () => {
    progressContext = {
      ...progressContext,
      isHydrated: false,
      progress: {
        episode: { listened: false, lastPositionSeconds: 120 },
      },
    };
    renderTracker();
    expect(player.seek).not.toHaveBeenCalled();

    progressContext = { ...progressContext, isHydrated: true };
    renderTracker();
    expect(player.seek).toHaveBeenCalledWith(120);
  });

  it('resumes classroom progress and skips completed episodes', () => {
    const skipToSection = vi.fn();
    player = makePlayer({
      skipToSection,
      sections: [
        { kind: 'main', hlsUrl: episode.hlsUrl },
        { kind: 'classroom', hlsUrl: 'https://example.com/classroom.m3u8' },
      ],
    });
    progressContext = {
      ...progressContext,
      progress: {
        episode: {
          listened: false,
          lastPositionSeconds: 45,
          lastPositionSection: 'classroom',
        },
      },
    };
    renderTracker();
    expect(skipToSection).toHaveBeenCalledWith('classroom', 45);

    act(() => root.unmount());
    root = createRoot(container);
    player = makePlayer();
    progressContext = {
      ...progressContext,
      progress: {
        episode: { listened: true, lastPositionSeconds: 120 },
      },
    };
    renderTracker();
    expect(player.seek).not.toHaveBeenCalled();
  });

  it('keeps the resume overwrite protection at exactly two seconds', () => {
    progressContext = {
      ...progressContext,
      progress: {
        episode: { listened: false, lastPositionSeconds: 120 },
      },
    };
    player = makePlayer({ currentTime: 1.999 });
    renderTracker();
    expect(player.seek).toHaveBeenCalledWith(120);

    act(() => root.unmount());
    root = createRoot(container);
    player = makePlayer({ currentTime: 2 });
    renderTracker();
    expect(player.seek).not.toHaveBeenCalled();
  });
});
