// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import { usePodcastPlayerQueue } from '@/integration/usePodcastPlayerQueue';
import { createPodcastEpisodeFactory } from './support/podcastEpisode';

const makeEpisode = createPodcastEpisodeFactory({
  id: 'article-1',
  localizationId: 'loc-1',
  hlsUrl: 'https://cdn.example/main.m3u8',
  audioTracks: [
    {
      languageCode: 'en',
      title: 'Episode',
      hlsUrl: 'https://cdn.example/main.m3u8',
      classroomHlsUrl: null,
      classrooms: [
        { languageCode: 'ja', hlsUrl: 'https://cdn.example/ja.m3u8' },
      ],
    },
  ],
});

const first = makeEpisode();
const second = makeEpisode({ id: 'article-2', localizationId: 'loc-2' });
const missing = makeEpisode({ id: 'article-3', localizationId: 'loc-3' });
const solo = makeEpisode({
  id: 'article-solo',
  localizationId: 'loc-solo',
  audioTracks: [
    {
      languageCode: 'en',
      title: 'Episode',
      hlsUrl: 'https://cdn.example/main.m3u8',
      classroomHlsUrl: null,
      classrooms: [],
    },
  ],
});

const callbacks = {
  playEpisode: vi.fn(),
  playEpisodeAt: vi.fn(),
  playEpisodeSection: vi.fn(),
  toggleCurrentPlayback: vi.fn(),
};

type QueueState = ReturnType<typeof usePodcastPlayerQueue>;

interface Harness {
  current(): QueueState;
  rerender(nowPlaying: PodcastEpisode | null): Promise<void>;
  root: Root;
  container: HTMLDivElement;
}

let active: Harness | null = null;

function Probe({
  nowPlaying,
  onValue,
}: {
  nowPlaying: PodcastEpisode | null;
  onValue: (value: QueueState) => void;
}): ReactElement | null {
  onValue(usePodcastPlayerQueue({ nowPlaying, ...callbacks }));
  return null;
}

async function render(nowPlaying: PodcastEpisode | null): Promise<Harness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let value: QueueState | null = null;
  const draw = async (episode: PodcastEpisode | null) => {
    await act(async () =>
      root.render(
        createElement(Probe, {
          nowPlaying: episode,
          onValue: (next) => (value = next),
        }),
      ),
    );
  };
  await draw(nowPlaying);
  active = {
    root,
    container,
    current: () => {
      if (!value) throw new Error('queue hook did not render');
      return value;
    },
    rerender: draw,
  };
  return active;
}

beforeEach(() => {
  vi.clearAllMocks();
  active = null;
});

afterEach(async () => {
  if (!active) return;
  await act(async () => active?.root.unmount());
  active.container.remove();
  active = null;
});

describe('usePodcastPlayerQueue', () => {
  it('toggles the same episode and starts a different standalone episode', async () => {
    const harness = await render(first);

    act(() => harness.current().toggle(makeEpisode({ id: 'stale-id' })));
    expect(callbacks.toggleCurrentPlayback).toHaveBeenCalledOnce();
    expect(callbacks.playEpisode).not.toHaveBeenCalled();

    act(() => harness.current().toggle(second));
    expect(callbacks.playEpisode).toHaveBeenCalledWith(second);
    expect(harness.current()).toMatchObject({ queue: [], queueIndex: -1 });
  });

  it('falls back to standalone toggle for empty or missing queues', async () => {
    const harness = await render(null);

    act(() => harness.current().playFromQueue([], first));
    act(() => harness.current().playFromQueue([first, second], missing));

    expect(callbacks.playEpisode).toHaveBeenNthCalledWith(1, first);
    expect(callbacks.playEpisode).toHaveBeenNthCalledWith(2, missing);
    expect(harness.current().queueIndex).toBe(-1);
  });

  it('latches a valid queue and either starts or toggles its target', async () => {
    const harness = await render(null);
    act(() => harness.current().playFromQueue([first, second], second));

    expect(harness.current().queue).toEqual([first, second]);
    expect(harness.current().queueIndex).toBe(1);
    expect(callbacks.playEpisode).toHaveBeenCalledWith(second);

    await harness.rerender(second);
    act(() => harness.current().playFromQueue([first, second], second));
    expect(callbacks.toggleCurrentPlayback).toHaveBeenCalledOnce();
  });

  it('stores explicit handoff state even when the target is absent', async () => {
    const harness = await render(null);

    act(() => harness.current().playFromQueueAt([first, second], missing, 42));
    expect(harness.current()).toMatchObject({
      queue: [first, second],
      queueIndex: -1,
    });
    expect(callbacks.playEpisodeAt).toHaveBeenLastCalledWith(missing, 42, true);

    act(() => harness.current().playFromQueueAt([first], first, 9, false));
    expect(callbacks.playEpisodeAt).toHaveBeenLastCalledWith(first, 9, false);
  });

  it('ignores a missing section and plays an exact classroom section', async () => {
    const harness = await render(null);

    act(() =>
      harness.current().playSectionFromQueue([solo], solo, 'classroom', {
        languageCode: 'fr',
      }),
    );
    expect(callbacks.playEpisodeSection).not.toHaveBeenCalled();

    act(() =>
      harness
        .current()
        .playSectionFromQueue([first, second], first, 'classroom', {
          languageCode: 'ja',
          atSeconds: 7,
          shouldPlay: false,
        }),
    );
    expect(harness.current()).toMatchObject({
      queue: [first, second],
      queueIndex: 0,
    });
    expect(callbacks.playEpisodeSection).toHaveBeenCalledWith(
      first,
      {
        kind: 'classroom',
        hlsUrl: 'https://cdn.example/ja.m3u8',
        languageCode: 'ja',
      },
      7,
      false,
    );
  });

  it('moves within queue bounds and returns null beyond either edge', async () => {
    const harness = await render(null);
    act(() => harness.current().playFromQueue([first, second], first));
    callbacks.playEpisode.mockClear();

    let previous: PodcastEpisode | null = first;
    act(() => {
      previous = harness.current().skipToPreviousEpisode();
    });
    expect(previous).toBeNull();

    let next: PodcastEpisode | null = null;
    act(() => {
      next = harness.current().skipToNextEpisode();
    });
    expect(next).toBe(second);
    expect(harness.current().queueIndex).toBe(1);
    expect(callbacks.playEpisode).toHaveBeenCalledWith(second);

    act(() => {
      next = harness.current().skipToNextEpisode();
    });
    expect(next).toBeNull();

    act(() => {
      previous = harness.current().skipToPreviousEpisode();
    });
    expect(previous).toBe(first);
    expect(harness.current().queueIndex).toBe(0);
  });
});
