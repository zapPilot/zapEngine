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

const CLASSROOM_SECTIONS_LEGACY = [
  { kind: 'main' as const, hlsUrl: episode.hlsUrl, languageCode: null },
  {
    kind: 'classroom' as const,
    hlsUrl: 'https://example.com/classroom.m3u8',
    languageCode: null,
  },
];

const CLASSROOM_SECTIONS_JA_EN = [
  { kind: 'main' as const, hlsUrl: episode.hlsUrl, languageCode: null },
  {
    kind: 'classroom' as const,
    hlsUrl: 'https://example.com/classroom-ja.m3u8',
    languageCode: 'ja',
  },
  {
    kind: 'classroom' as const,
    hlsUrl: 'https://example.com/classroom-en.m3u8',
    languageCode: 'en',
  },
];

function makePlayer(overrides: Partial<PodcastPlayer> = {}): PodcastPlayer {
  return {
    nowPlaying: episode,
    isPlaying: true,
    currentTime: 0,
    duration: 300,
    speed: 1,
    sections: [{ kind: 'main', hlsUrl: episode.hlsUrl, languageCode: null }],
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
      undefined,
    );

    player = makePlayer({ currentTime: 17 });
    renderTracker();
    expect(progressContext.setPosition).toHaveBeenCalledTimes(1);

    act(() => appStateMock.emit('background'));
    expect(progressContext.setPosition).toHaveBeenLastCalledWith(
      'episode',
      17,
      'main',
      undefined,
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
      undefined,
    );

    player = makePlayer({
      currentTime: 3,
      currentSection: 'classroom',
      sections: CLASSROOM_SECTIONS_LEGACY,
    });
    renderTracker();
    expect(progressContext.setPosition).toHaveBeenCalledWith(
      'episode',
      3,
      'classroom',
      undefined,
    );

    player = makePlayer({
      currentTime: 6,
      currentSection: 'classroom',
      sections: CLASSROOM_SECTIONS_LEGACY,
    });
    renderTracker();
    act(() => root.unmount());
    expect(progressContext.setPosition).toHaveBeenLastCalledWith(
      'episode',
      6,
      'classroom',
      undefined,
    );
    root = createRoot(container);
  });

  it('flushes when the classroom language changes within the same section kind', () => {
    player = makePlayer({
      currentTime: 5,
      currentSection: 'classroom',
      currentSectionLanguage: 'ja',
      sections: CLASSROOM_SECTIONS_JA_EN,
    });
    renderTracker();

    player = makePlayer({
      currentTime: 2,
      currentSection: 'classroom',
      currentSectionLanguage: 'en',
      sections: CLASSROOM_SECTIONS_JA_EN,
    });
    renderTracker();

    // The ja position is force-flushed the moment the language changes to en,
    // even though 5 seconds is below the ten-second persist interval.
    expect(progressContext.setPosition).toHaveBeenCalledWith(
      'episode',
      5,
      'classroom',
      'ja',
    );
  });
});

describe('PodcastProgressTracker completion', () => {
  it('marks an episode completed only after its final section finishes', () => {
    const sections = CLASSROOM_SECTIONS_LEGACY;

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

  it('does not mark completed when the ja classroom language finishes but en is still pending', () => {
    player = makePlayer({
      currentTime: 88,
      duration: 90,
      currentSection: 'classroom',
      currentSectionLanguage: 'ja',
      sections: CLASSROOM_SECTIONS_JA_EN,
    });
    renderTracker();
    expect(progressContext.markListened).not.toHaveBeenCalled();
  });

  it('marks completed only once the last classroom language (en) finishes', () => {
    player = makePlayer({
      currentTime: 88,
      duration: 90,
      currentSection: 'classroom',
      currentSectionLanguage: 'en',
      sections: CLASSROOM_SECTIONS_JA_EN,
    });
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

  it('resumes classroom progress (legacy entry, no saved language) and skips completed episodes', () => {
    const skipToSection = vi.fn();
    player = makePlayer({
      skipToSection,
      sections: CLASSROOM_SECTIONS_LEGACY,
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
    expect(skipToSection).toHaveBeenCalledWith('classroom', 45, undefined);

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

  it('resumes into the saved classroom language when the episode has more than one', () => {
    const skipToSection = vi.fn();
    player = makePlayer({
      skipToSection,
      sections: CLASSROOM_SECTIONS_JA_EN,
    });
    progressContext = {
      ...progressContext,
      progress: {
        episode: {
          listened: false,
          lastPositionSeconds: 45,
          lastPositionSection: 'classroom',
          lastPositionClassroomLanguage: 'ja',
        },
      },
    };
    renderTracker();
    expect(skipToSection).toHaveBeenCalledWith('classroom', 45, 'ja');
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
