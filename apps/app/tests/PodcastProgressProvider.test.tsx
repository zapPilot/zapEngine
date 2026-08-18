// @vitest-environment jsdom

import { act, type ReactElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PodcastProgressMap } from '@/integration/podcastProgress';
import {
  PodcastProgressProvider,
  useEpisodeProgress,
} from '@/providers/PodcastProgressProvider';

const storageMocks = vi.hoisted(() => ({
  loadPodcastProgress: vi.fn(),
  savePodcastProgress: vi.fn(),
}));

vi.mock('@/storage/podcastStorage', () => storageMocks);

let root: Root;
let container: HTMLDivElement;
let progressContext: ReturnType<typeof useEpisodeProgress> | undefined;

function CaptureProgress(): ReactElement | null {
  const value = useEpisodeProgress();
  useEffect(() => {
    progressContext = value;
  }, [value]);
  return null;
}

function context(): ReturnType<typeof useEpisodeProgress> {
  if (progressContext === undefined) {
    throw new Error('progress context has not rendered');
  }
  return progressContext;
}

async function mountProvider(): Promise<void> {
  await act(async () => {
    root.render(
      <PodcastProgressProvider>
        <CaptureProgress />
      </PodcastProgressProvider>,
    );
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  storageMocks.loadPodcastProgress.mockReset();
  storageMocks.savePodcastProgress.mockReset();
  storageMocks.loadPodcastProgress.mockResolvedValue({});
  storageMocks.savePodcastProgress.mockResolvedValue(undefined);
  progressContext = undefined;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('PodcastProgressProvider', () => {
  it('hydrates 120 seconds from durable storage', async () => {
    storageMocks.loadPodcastProgress.mockResolvedValue({
      episode: { listened: false, lastPositionSeconds: 120 },
    });

    await mountProvider();

    expect(context().isHydrated).toBe(true);
    expect(context().progress['episode']).toEqual({
      listened: false,
      lastPositionSeconds: 120,
    });
  });

  it('persists an update across provider remounts', async () => {
    let stored: PodcastProgressMap = {};
    storageMocks.loadPodcastProgress.mockImplementation(async () =>
      structuredClone(stored),
    );
    storageMocks.savePodcastProgress.mockImplementation(
      async (next: PodcastProgressMap) => {
        stored = structuredClone(next);
      },
    );

    await mountProvider();
    act(() => context().setPosition('episode', 150));
    await act(async () => Promise.resolve());
    await act(async () => root.unmount());

    progressContext = undefined;
    root = createRoot(container);
    await mountProvider();

    expect(context().progress['episode']?.lastPositionSeconds).toBe(150);
  });

  it('merges mutations made while hydration is pending', async () => {
    let resolveLoad: ((progress: PodcastProgressMap) => void) | undefined;
    storageMocks.loadPodcastProgress.mockReturnValue(
      new Promise<PodcastProgressMap>((resolve) => {
        resolveLoad = resolve;
      }),
    );

    await mountProvider();
    expect(context().isHydrated).toBe(false);
    act(() => context().setPosition('episode', 150, 'classroom'));

    await act(async () => {
      resolveLoad?.({
        episode: { listened: true, lastPositionSeconds: 120 },
        other: { listened: false, lastPositionSeconds: 60 },
      });
    });

    expect(context().progress).toEqual({
      episode: {
        listened: true,
        lastPositionSeconds: 150,
        lastPositionSection: 'classroom',
      },
      other: { listened: false, lastPositionSeconds: 60 },
    });
    expect(storageMocks.savePodcastProgress).toHaveBeenLastCalledWith(
      context().progress,
    );
  });

  it('clears a saved classroom language once a later write moves to the main section', async () => {
    await mountProvider();
    act(() => context().setPosition('episode', 45, 'classroom', 'ja'));
    expect(context().progress['episode']).toEqual({
      listened: false,
      lastPositionSeconds: 45,
      lastPositionSection: 'classroom',
      lastPositionClassroomLanguage: 'ja',
    });

    act(() => context().setPosition('episode', 90, 'main'));
    expect(context().progress['episode']).toEqual({
      listened: false,
      lastPositionSeconds: 90,
      lastPositionSection: 'main',
    });
  });
});
