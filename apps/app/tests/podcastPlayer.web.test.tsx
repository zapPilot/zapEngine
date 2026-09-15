// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import type { PodcastPlaybackSection } from '@/integration/podcastSections';
import { usePodcastPlayer } from '@/integration/podcastPlayer.web';
import { createPodcastEpisodeFactory } from './support/podcastEpisode';

const hls = vi.hoisted(() => {
  const instances: {
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }[] = [];
  class FakeHls {
    static isSupported = vi.fn(() => true);
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();

    constructor() {
      instances.push(this);
    }
  }
  return { FakeHls, instances };
});

const queue = vi.hoisted(() => ({
  args: null as null | {
    nowPlaying: PodcastEpisode | null;
    playEpisode: (episode: PodcastEpisode) => void;
    playEpisodeAt: (
      episode: PodcastEpisode,
      seconds: number,
      shouldPlay: boolean,
    ) => void;
    playEpisodeSection: (
      episode: PodcastEpisode,
      section: PodcastPlaybackSection,
      seconds: number,
      shouldPlay: boolean,
    ) => void;
    toggleCurrentPlayback: () => void;
  },
  state: {
    queue: [] as readonly PodcastEpisode[],
    queueIndex: -1,
    toggle: vi.fn(),
    playFromQueue: vi.fn(),
    playFromQueueAt: vi.fn(),
    playSectionFromQueue: vi.fn(),
    skipToPreviousEpisode: vi.fn(() => null as PodcastEpisode | null),
    skipToNextEpisode: vi.fn(() => null as PodcastEpisode | null),
  },
}));

const speed = vi.hoisted(() => ({
  preferences: { mainSpeed: 1.25, classroomSpeed: 0.9 },
  setSpeedForSection: vi.fn((_section: string, next: number) => next),
}));

vi.mock('hls.js', () => ({ default: hls.FakeHls }));
vi.mock('@/integration/usePodcastPlayerQueue', () => ({
  usePodcastPlayerQueue: (args: NonNullable<typeof queue.args>) => {
    queue.args = args;
    return queue.state;
  },
}));
vi.mock('@/hooks/usePodcastSpeedPreferences', () => ({
  usePodcastSpeedPreferences: () => speed,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class FakeAudio {
  static instances: FakeAudio[] = [];

  paused = true;
  currentTime = 0;
  duration = Number.NaN;
  readyState = 0;
  playbackRate = 1;
  src = '';
  nativeHlsSupport = 'maybe';
  private listeners = new Map<string, Set<() => void>>();

  play = vi.fn(async () => {
    this.paused = false;
    this.emit('play');
  });

  pause = vi.fn(() => {
    this.paused = true;
    this.emit('pause');
  });

  canPlayType = vi.fn(() => this.nativeHlsSupport);
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });

  constructor() {
    FakeAudio.instances.push(this);
  }

  addEventListener(name: string, listener: () => void): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: () => void): void {
    this.listeners.get(name)?.delete(listener);
  }

  emit(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener();
  }

  listenerCount(name: string): number {
    return this.listeners.get(name)?.size ?? 0;
  }
}

class FakeMediaMetadata {
  constructor(readonly init: MediaMetadataInit) {}
}

const mediaSession = {
  metadata: null as FakeMediaMetadata | null,
  playbackState: 'none' as MediaSessionPlaybackState,
  handlers: new Map<string, (() => void) | null>(),
  setActionHandler: vi.fn((name: string, handler: (() => void) | null) => {
    mediaSession.handlers.set(name, handler);
  }),
  setPositionState: vi.fn(),
};

const makeEpisode = createPodcastEpisodeFactory({
  id: 'article-1',
  localizationId: 'loc-1',
  title: 'Episode one',
  hlsUrl: 'https://cdn.example/main.m3u8',
  audioTracks: [
    {
      languageCode: 'en',
      title: 'Episode one',
      hlsUrl: 'https://cdn.example/main.m3u8',
      classroomHlsUrl: 'https://cdn.example/classroom.m3u8',
      classrooms: [],
    },
  ],
});

const episode = makeEpisode();
const nextEpisode = makeEpisode({
  id: 'article-2',
  localizationId: 'loc-2',
  title: 'Episode two',
  hlsUrl: 'https://cdn.example/next.m3u8',
});

interface Harness {
  current(): PodcastPlayer;
  root: Root;
  container: HTMLDivElement;
}

let active: Harness | null = null;

function Probe({
  onValue,
}: {
  onValue: (value: PodcastPlayer) => void;
}): ReactElement | null {
  onValue(usePodcastPlayer());
  return null;
}

async function render(): Promise<Harness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let value: PodcastPlayer | null = null;
  await act(async () => {
    root.render(createElement(Probe, { onValue: (next) => (value = next) }));
  });
  active = {
    root,
    container,
    current: () => {
      if (!value) throw new Error('podcast player did not render');
      return value;
    },
  };
  return active;
}

function audio(): FakeAudio {
  const instance = FakeAudio.instances.at(-1);
  if (!instance) throw new Error('Audio was not constructed');
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeAudio.instances = [];
  hls.instances.length = 0;
  hls.FakeHls.isSupported.mockReturnValue(true);
  queue.args = null;
  queue.state.queue = [];
  queue.state.queueIndex = -1;
  speed.preferences.mainSpeed = 1.25;
  speed.preferences.classroomSpeed = 0.9;
  speed.setSpeedForSection.mockImplementation((_section, next) => next);
  mediaSession.metadata = null;
  mediaSession.playbackState = 'none';
  mediaSession.handlers.clear();
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
  Object.defineProperty(window.navigator, 'mediaSession', {
    configurable: true,
    value: mediaSession,
  });
  active = null;
});

afterEach(async () => {
  if (active) {
    await act(async () => active?.root.unmount());
    active.container.remove();
    active = null;
  }
  delete (window.navigator as Navigator & { mediaSession?: unknown })
    .mediaSession;
  vi.unstubAllGlobals();
});

describe('usePodcastPlayer web media lifecycle', () => {
  it('loads native HLS, mirrors events, seeks safely, and cleans the element up', async () => {
    const harness = await render();
    const element = audio();

    expect(queue.args?.nowPlaying).toBeNull();
    expect(mediaSession.handlers.size).toBe(6);
    expect(mediaSession.metadata).toBeNull();
    expect(mediaSession.playbackState).toBe('paused');

    await act(async () => queue.args?.playEpisode(episode));
    expect(element.src).toBe(episode.hlsUrl);
    expect(element.playbackRate).toBe(1.25);
    expect(element.play).toHaveBeenCalled();
    expect(harness.current()).toMatchObject({
      nowPlaying: episode,
      isPlaying: true,
      currentSection: 'main',
      currentSectionLanguage: null,
      speed: 1.25,
    });
    expect(mediaSession.metadata?.init).toMatchObject({
      title: 'Episode one',
      artist: 'From Fed to Chain',
      artwork: [],
    });
    expect(mediaSession.playbackState).toBe('playing');

    await act(async () => {
      element.currentTime = 12;
      element.emit('timeupdate');
      element.duration = 100;
      element.readyState = HTMLMediaElement.HAVE_METADATA;
      element.emit('durationchange');
    });
    expect(harness.current()).toMatchObject({ currentTime: 12, duration: 100 });

    act(() => harness.current().seek(120));
    expect(element.currentTime).toBe(100);
    act(() => harness.current().seek(-4));
    expect(element.currentTime).toBe(0);
    act(() => harness.current().seekRelative(8));
    expect(element.currentTime).toBe(20);

    act(() => harness.current().setSpeed(1.75));
    expect(speed.setSpeedForSection).toHaveBeenCalledWith('main', 1.75);
    expect(element.playbackRate).toBe(1.75);

    act(() => harness.current().pause());
    expect(harness.current().isPlaying).toBe(false);
    await act(async () => queue.args?.toggleCurrentPlayback());
    expect(element.play).toHaveBeenCalledTimes(2);
    act(() => queue.args?.toggleCurrentPlayback());
    expect(element.pause).toHaveBeenCalled();

    await act(async () => harness.root.unmount());
    harness.container.remove();
    active = null;
    expect(element.removeAttribute).toHaveBeenCalledWith('src');
    expect(element.listenerCount('timeupdate')).toBe(0);
    expect(mediaSession.setActionHandler).toHaveBeenCalledWith('play', null);
  });

  it('uses unclamped nonnegative seeking while duration is unknown', async () => {
    const harness = await render();
    act(() => harness.current().seek(44));
    expect(audio().currentTime).toBe(44);
    act(() => harness.current().seek(-1));
    expect(audio().currentTime).toBe(0);
  });

  it('forwards the public queue contract unchanged', async () => {
    const harness = await render();
    expect(harness.current()).toMatchObject({
      toggle: queue.state.toggle,
      playFromQueue: queue.state.playFromQueue,
      playFromQueueAt: queue.state.playFromQueueAt,
      playSectionFromQueue: queue.state.playSectionFromQueue,
    });
  });
});

describe('usePodcastPlayer web source selection', () => {
  it('uses hls.js when native HLS is unavailable and destroys replaced sources', async () => {
    await render();
    const element = audio();
    element.nativeHlsSupport = '';

    await act(async () => queue.args?.playEpisode(episode));
    expect(hls.instances).toHaveLength(1);
    expect(hls.instances[0]?.loadSource).toHaveBeenCalledWith(episode.hlsUrl);
    expect(hls.instances[0]?.attachMedia).toHaveBeenCalledWith(element);

    await act(async () => queue.args?.playEpisode(nextEpisode));
    expect(hls.instances[0]?.destroy).toHaveBeenCalledOnce();
    expect(hls.instances).toHaveLength(2);
  });

  it('leaves playback untouched when neither native nor hls.js support exists', async () => {
    const harness = await render();
    const element = audio();
    element.nativeHlsSupport = '';
    hls.FakeHls.isSupported.mockReturnValue(false);

    await act(async () => queue.args?.playEpisode(episode));

    expect(harness.current().nowPlaying).toBeNull();
    expect(element.play).not.toHaveBeenCalled();
    expect(hls.instances).toHaveLength(0);
  });
});

describe('usePodcastPlayer web handoffs and sections', () => {
  it('waits for metadata, clamps a pending handoff, and preserves play intent', async () => {
    const harness = await render();
    const element = audio();

    act(() => queue.args?.playEpisodeAt(episode, 150, true));
    expect(harness.current().nowPlaying).toBe(episode);
    expect(element.play).not.toHaveBeenCalled();

    act(() => element.emit('loadedmetadata'));
    expect(element.currentTime).toBe(0);

    element.duration = 100;
    element.readyState = HTMLMediaElement.HAVE_METADATA;
    await act(async () => element.emit('loadedmetadata'));
    expect(element.currentTime).toBe(100);
    expect(element.play).toHaveBeenCalledOnce();

    act(() => queue.args?.playEpisodeAt(episode, 25, false));
    expect(element.currentTime).toBe(25);
    expect(element.pause).toHaveBeenCalled();
  });

  it('plays zero-offset and paused-offset sections with independent speed', async () => {
    const harness = await render();
    const element = audio();
    const classroom = {
      kind: 'classroom' as const,
      hlsUrl: 'https://cdn.example/classroom.m3u8',
      languageCode: null,
    };

    await act(async () =>
      queue.args?.playEpisodeSection(episode, classroom, 0, true),
    );
    expect(harness.current()).toMatchObject({
      currentSection: 'classroom',
      currentSectionLanguage: null,
      speed: 0.9,
    });
    expect(element.playbackRate).toBe(0.9);
    expect(element.play).toHaveBeenCalledOnce();

    element.duration = 80;
    element.readyState = HTMLMediaElement.HAVE_METADATA;
    act(() => queue.args?.playEpisodeSection(episode, classroom, 30, false));
    act(() => element.emit('durationchange'));
    expect(element.currentTime).toBe(30);
    expect(element.paused).toBe(true);
  });

  it('jumps only to existing sections and advances section before episode', async () => {
    const harness = await render();
    queue.state.queue = [episode, nextEpisode];
    queue.state.queueIndex = 0;
    await act(async () => queue.args?.playEpisode(episode));
    const element = audio();
    element.play.mockClear();

    act(() => harness.current().skipToSection('classroom'));
    expect(element.src).toBe('https://cdn.example/classroom.m3u8');
    expect(harness.current().currentSection).toBe('classroom');

    act(() => harness.current().skipToSection('classroom', 0, 'fr'));
    expect(element.src).toBe('https://cdn.example/classroom.m3u8');

    await act(async () => queue.args?.playEpisode(episode));
    act(() => element.emit('ended'));
    expect(element.src).toBe('https://cdn.example/classroom.m3u8');

    act(() => element.emit('ended'));
    expect(queue.state.skipToNextEpisode).toHaveBeenCalled();
  });
});

describe('usePodcastPlayer web media-session commands', () => {
  it('handles transport, bounded remote seeking, and queue navigation', async () => {
    await render();
    const element = audio();
    element.currentTime = 10;
    element.duration = 35;

    await act(async () => mediaSession.handlers.get('play')?.());
    act(() => mediaSession.handlers.get('pause')?.());
    act(() => mediaSession.handlers.get('seekbackward')?.());
    expect(element.currentTime).toBe(0);
    act(() => mediaSession.handlers.get('seekforward')?.());
    expect(element.currentTime).toBe(30);
    act(() => mediaSession.handlers.get('seekforward')?.());
    expect(element.currentTime).toBe(35);

    act(() => mediaSession.handlers.get('nexttrack')?.());
    act(() => mediaSession.handlers.get('previoustrack')?.());
    expect(queue.state.skipToNextEpisode).toHaveBeenCalledOnce();
    expect(queue.state.skipToPreviousEpisode).toHaveBeenCalledOnce();
  });

  it('syncs lock-screen position on duration changes and seeking', async () => {
    await render();
    const element = audio();
    element.currentTime = 20;
    element.duration = 120;
    element.readyState = HTMLMediaElement.HAVE_METADATA;

    await act(async () => element.emit('durationchange'));
    expect(mediaSession.setPositionState).toHaveBeenLastCalledWith({
      duration: 120,
      playbackRate: 1.25,
      position: 20,
    });

    element.currentTime = 55;
    act(() => element.emit('seeked'));
    expect(mediaSession.setPositionState).toHaveBeenLastCalledWith({
      duration: 120,
      playbackRate: 1.25,
      position: 55,
    });
  });
});
