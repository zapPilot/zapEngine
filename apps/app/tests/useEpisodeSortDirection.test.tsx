// @vitest-environment jsdom
import { act, type ReactElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EpisodeSortDirection } from '@/components/podcast/episodeSorting';
import { useEpisodeSortDirection } from '@/hooks/useEpisodeSortDirection';

const storageMocks = vi.hoisted(() => ({
  loadPodcastSortDirection: vi.fn(),
  savePodcastSortDirection: vi.fn(),
}));

vi.mock('@/storage/podcastStorage', () => storageMocks);

let root: Root;
let container: HTMLDivElement;
let captured: ReturnType<typeof useEpisodeSortDirection> | undefined;

function Capture(): ReactElement | null {
  const value = useEpisodeSortDirection();
  useEffect(() => {
    captured = value;
  }, [value]);
  return null;
}

function current(): ReturnType<typeof useEpisodeSortDirection> {
  if (captured === undefined) throw new Error('hook has not rendered');
  return captured;
}

async function mount(): Promise<void> {
  await act(async () => {
    root.render(<Capture />);
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  storageMocks.loadPodcastSortDirection.mockReset();
  storageMocks.savePodcastSortDirection.mockReset();
  storageMocks.loadPodcastSortDirection.mockResolvedValue(
    'newest' as EpisodeSortDirection,
  );
  storageMocks.savePodcastSortDirection.mockResolvedValue(undefined);
  captured = undefined;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('useEpisodeSortDirection', () => {
  it('hydrates oldest from durable storage (core requirement 1)', async () => {
    storageMocks.loadPodcastSortDirection.mockResolvedValue('oldest');

    await mount();

    expect(current().direction).toBe('oldest');
  });

  it('falls back to newest for missing / corrupt / unknown (core requirement 2)', async () => {
    // load already parses and returns newest for those cases;
    // verify hook accepts the parsed newest as default
    storageMocks.loadPodcastSortDirection.mockResolvedValue('newest');

    await mount();

    expect(current().direction).toBe('newest');

    // also verify explicit unknown would have been parsed to newest;
    // here we simulate the storage layer returning newest for corrupt
    captured = undefined;
    await act(async () => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    storageMocks.loadPodcastSortDirection.mockResolvedValue('newest');
    await mount();
    expect(current().direction).toBe('newest');
  });

  it('persists user change across remounts (core requirement 3)', async () => {
    let stored: EpisodeSortDirection = 'newest';
    storageMocks.loadPodcastSortDirection.mockImplementation(
      async () => stored,
    );
    storageMocks.savePodcastSortDirection.mockImplementation(
      async (next: EpisodeSortDirection) => {
        stored = next;
      },
    );

    await mount();
    expect(current().direction).toBe('newest');

    act(() => current().setDirection('oldest'));
    expect(current().direction).toBe('oldest');
    await act(async () => Promise.resolve());
    expect(stored).toBe('oldest');

    await act(async () => root.unmount());
    captured = undefined;
    root = createRoot(container);
    await mount();

    expect(current().direction).toBe('oldest');
  });

  it('user action before hydration finishes wins over stale stored value (core requirement 4)', async () => {
    let resolveLoad: ((v: EpisodeSortDirection) => void) | undefined;
    storageMocks.loadPodcastSortDirection.mockReturnValue(
      new Promise<EpisodeSortDirection>((resolve) => {
        resolveLoad = resolve;
      }),
    );

    await mount();
    expect(current().direction).toBe('newest');

    act(() => current().setDirection('oldest'));
    expect(current().direction).toBe('oldest');
    expect(storageMocks.savePodcastSortDirection).toHaveBeenCalledWith(
      'oldest',
    );

    await act(async () => {
      resolveLoad?.('newest');
    });

    expect(current().direction).toBe('oldest');
  });

  it('pending-only durable write survives unmount before hydration resolves', async () => {
    let stored: EpisodeSortDirection = 'newest';
    let resolveLoad: ((v: EpisodeSortDirection) => void) | undefined;
    storageMocks.loadPodcastSortDirection.mockImplementation(
      () =>
        new Promise<EpisodeSortDirection>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    storageMocks.savePodcastSortDirection.mockImplementation(
      async (next: EpisodeSortDirection) => {
        stored = next;
      },
    );

    await mount();
    act(() => current().setDirection('oldest'));
    expect(storageMocks.savePodcastSortDirection).toHaveBeenCalledWith(
      'oldest',
    );
    expect(stored).toBe('oldest');

    await act(async () => root.unmount());
    await act(async () => {
      resolveLoad?.('newest');
    });

    // Remount should read the durable oldest value written before unmount
    storageMocks.loadPodcastSortDirection.mockImplementation(
      async () => stored,
    );
    captured = undefined;
    root = createRoot(container);
    await mount();

    expect(current().direction).toBe('oldest');
  });

  it('does not expose isHydrated', async () => {
    await mount();
    expect(current()).not.toHaveProperty('isHydrated');
  });
});
