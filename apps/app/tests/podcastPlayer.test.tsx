// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import { usePodcastPlayer } from '@/integration/podcastPlayer';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import type { PodcastPlaybackSection } from '@/integration/podcastSections';
import { createPodcastEpisodeFactory } from './support/podcastEpisode';

const audio = vi.hoisted(() => {
  const status = {
    playing: false,
    didJustFinish: false,
    isLoaded: true,
    duration: 0,
    currentTime: 0,
  };
  const player = {
    replace: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(async () => undefined),
    setPlaybackRate: vi.fn(),
    setActiveForLockScreen: vi.fn(),
    updateLockScreenMetadata: vi.fn(),
    clearLockScreenControls: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
    currentStatus: { isLoaded: true, duration: 0 },
  };
  return { status, player };
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

vi.mock('expo-audio', () => ({
  setAudioModeAsync: vi.fn(async () => undefined),
  useAudioPlayer: () => audio.player,
  useAudioPlayerStatus: () => audio.status,
}));
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

const makeEpisode = createPodcastEpisodeFactory({
  id: 'article-1',
  localizationId: 'loc-1',
  title: 'Episode one',
  hlsUrl: 'https://cdn.example/main.m3u8',
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
  redraw(): Promise<void>;
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
  const redraw = async () => {
    await act(async () => {
      root.render(createElement(Probe, { onValue: (next) => (value = next) }));
    });
  };
  await redraw();
  active = {
    root,
    container,
    current: () => {
      if (!value) throw new Error('podcast player did not render');
      return value;
    },
    redraw,
  };
  return active;
}

async function setPlaying(harness: Harness, playing: boolean): Promise<void> {
  audio.status.playing = playing;
  await harness.redraw();
}

beforeEach(() => {
  vi.clearAllMocks();
  audio.status.playing = false;
  audio.status.didJustFinish = false;
  audio.status.isLoaded = true;
  audio.status.duration = 0;
  audio.status.currentTime = 0;
  audio.player.currentStatus.isLoaded = true;
  audio.player.currentStatus.duration = 0;
  queue.args = null;
  active = null;
});

afterEach(async () => {
  if (active) {
    await act(async () => active?.root.unmount());
    active.container.remove();
    active = null;
  }
});

describe('usePodcastPlayer native source handoff', () => {
  it('keeps a replacement episode at 0/0 until the new source clock catches up', async () => {
    const harness = await render();

    // Start episode A and let its initial zero-position handoff settle.
    audio.player.currentStatus.isLoaded = true;
    audio.player.currentStatus.duration = 300;
    await act(async () => queue.args?.playEpisode(episode));
    audio.status.isLoaded = true;
    audio.status.currentTime = 0;
    audio.status.duration = 300;
    await harness.redraw();

    audio.status.playing = true;
    audio.status.currentTime = 295;
    await harness.redraw();
    expect(harness.current()).toMatchObject({
      nowPlaying: episode,
      currentTime: 295,
      duration: 300,
    });

    audio.player.pause.mockClear();
    audio.player.play.mockClear();
    audio.player.seekTo.mockClear();

    // Native replace can publish the new episode identity before
    // useAudioPlayerStatus stops reporting A's 295/300 clock.
    audio.player.replace.mockImplementationOnce(() => {
      audio.player.currentStatus.isLoaded = false;
      audio.player.currentStatus.duration = 0;
      audio.status.isLoaded = false;
    });
    await act(async () => queue.args?.playEpisode(nextEpisode));

    expect(audio.player.pause).toHaveBeenCalled();
    expect(harness.current()).toMatchObject({
      nowPlaying: nextEpisode,
      currentTime: 0,
      duration: 0,
    });
    expect(audio.player.seekTo).not.toHaveBeenCalled();

    // Multiple renders with the outgoing hook status must remain fenced.
    await harness.redraw();
    await harness.redraw();
    expect(harness.current()).toMatchObject({
      currentTime: 0,
      duration: 0,
    });

    // Once the replacement source itself is loaded, seek it explicitly to zero.
    audio.player.currentStatus.isLoaded = true;
    audio.player.currentStatus.duration = 240;
    audio.status.isLoaded = true;
    await harness.redraw();
    expect(audio.player.seekTo).toHaveBeenCalledWith(0);
    expect(audio.player.play).not.toHaveBeenCalled();

    // The hook may still lag one or more renders after seekTo resolves.
    expect(harness.current()).toMatchObject({
      currentTime: 0,
      duration: 0,
    });
    await harness.redraw();
    expect(harness.current()).toMatchObject({
      currentTime: 0,
      duration: 0,
    });

    // Release the fence only when hook status matches the replacement source.
    audio.status.isLoaded = true;
    audio.status.currentTime = 0;
    audio.status.duration = 240;
    await harness.redraw();
    expect(audio.player.play).toHaveBeenCalled();
    expect(harness.current()).toMatchObject({
      nowPlaying: nextEpisode,
      currentTime: 0,
      duration: 240,
    });
  });

  it('keeps the source clock fenced when playback is paused during loading', async () => {
    const harness = await render();

    audio.status.isLoaded = true;
    audio.status.playing = true;
    audio.status.currentTime = 295;
    audio.status.duration = 300;
    audio.player.replace.mockImplementationOnce(() => {
      audio.player.currentStatus.isLoaded = false;
      audio.player.currentStatus.duration = 0;
      audio.status.isLoaded = false;
    });

    await act(async () => queue.args?.playEpisode(nextEpisode));
    act(() => harness.current().pause());

    expect(harness.current()).toMatchObject({
      nowPlaying: nextEpisode,
      currentTime: 0,
      duration: 0,
    });

    audio.player.play.mockClear();
    audio.player.currentStatus.isLoaded = true;
    audio.player.currentStatus.duration = 240;
    audio.status.isLoaded = true;
    await harness.redraw();

    expect(audio.player.seekTo).toHaveBeenCalledWith(0);
    expect(audio.player.play).not.toHaveBeenCalled();

    audio.status.playing = false;
    audio.status.currentTime = 0;
    audio.status.duration = 240;
    await harness.redraw();

    expect(harness.current()).toMatchObject({
      nowPlaying: nextEpisode,
      isPlaying: false,
      currentTime: 0,
      duration: 240,
    });
  });

  it('honors pause after seek applies but before the status hook catches up', async () => {
    const harness = await render();

    audio.status.currentTime = 295;
    audio.status.duration = 300;
    audio.player.replace.mockImplementationOnce(() => {
      audio.player.currentStatus.isLoaded = false;
      audio.player.currentStatus.duration = 0;
      audio.status.isLoaded = false;
    });
    await act(async () => queue.args?.playEpisode(nextEpisode));

    audio.player.currentStatus.isLoaded = true;
    audio.player.currentStatus.duration = 240;
    audio.status.isLoaded = true;
    await harness.redraw();
    expect(audio.player.seekTo).toHaveBeenCalledWith(0);
    expect(audio.player.play).not.toHaveBeenCalled();

    act(() => harness.current().pause());
    audio.status.playing = false;
    audio.status.currentTime = 0;
    audio.status.duration = 240;
    await harness.redraw();

    expect(audio.player.play).not.toHaveBeenCalled();
    expect(harness.current()).toMatchObject({
      nowPlaying: nextEpisode,
      isPlaying: false,
      currentTime: 0,
      duration: 240,
    });
  });

  it('preserves a non-zero paused handoff after the replacement source loads', async () => {
    const harness = await render();

    audio.player.replace.mockImplementationOnce(() => {
      audio.player.currentStatus.isLoaded = false;
      audio.player.currentStatus.duration = 0;
      audio.status.isLoaded = false;
    });
    await act(async () => queue.args?.playEpisodeAt(nextEpisode, 90, false));

    expect(harness.current()).toMatchObject({
      nowPlaying: nextEpisode,
      currentTime: 0,
      duration: 0,
    });
    expect(audio.player.seekTo).not.toHaveBeenCalled();

    audio.player.currentStatus.isLoaded = true;
    audio.player.currentStatus.duration = 240;
    audio.status.isLoaded = true;
    await harness.redraw();
    expect(audio.player.seekTo).toHaveBeenCalledWith(90);

    audio.status.isLoaded = true;
    audio.status.playing = false;
    audio.status.currentTime = 90;
    audio.status.duration = 240;
    await harness.redraw();

    expect(harness.current()).toMatchObject({
      nowPlaying: nextEpisode,
      isPlaying: false,
      currentTime: 90,
      duration: 240,
    });
  });

  it('fences section switches too so the outgoing section clock cannot leak', async () => {
    const harness = await render();
    const classroom: PodcastPlaybackSection = {
      kind: 'classroom',
      hlsUrl: 'https://cdn.example/classroom.m3u8',
      languageCode: null,
    };

    audio.player.currentStatus.isLoaded = true;
    audio.player.currentStatus.duration = 300;
    await act(async () => queue.args?.playEpisode(episode));
    audio.status.isLoaded = true;
    audio.status.currentTime = 120;
    audio.status.duration = 300;
    await harness.redraw();

    audio.player.replace.mockImplementationOnce(() => {
      audio.player.currentStatus.isLoaded = false;
      audio.player.currentStatus.duration = 0;
      audio.status.isLoaded = false;
    });
    await act(async () =>
      queue.args?.playEpisodeSection(episode, classroom, 0, true),
    );

    expect(harness.current()).toMatchObject({
      currentSection: 'classroom',
      currentTime: 0,
      duration: 0,
    });
  });
});

describe('usePodcastPlayer iOS Now Playing reclaim', () => {
  it('reclaims the media session when paused audio resumes without a metadata change', async () => {
    const harness = await render();

    await act(async () => queue.args?.playEpisode(episode));
    await setPlaying(harness, true);
    expect(harness.current().isPlaying).toBe(true);
    audio.player.setActiveForLockScreen.mockClear();
    audio.player.updateLockScreenMetadata.mockClear();

    // Audio -> video handoff pauses audio; pausing must never steal Now Playing.
    await setPlaying(harness, false);
    expect(harness.current().isPlaying).toBe(false);
    expect(audio.player.setActiveForLockScreen).not.toHaveBeenCalled();
    expect(audio.player.updateLockScreenMetadata).not.toHaveBeenCalled();

    // Video -> audio handoff resumes the same episode and section, so no
    // metadata effect runs. The resume edge itself must reclaim Now Playing.
    await setPlaying(harness, true);
    expect(audio.player.setActiveForLockScreen).toHaveBeenCalledTimes(1);
    expect(audio.player.setActiveForLockScreen).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        title: 'Episode one',
        artist: 'From Fed to Chain',
      }),
      expect.anything(),
    );
    expect(audio.player.updateLockScreenMetadata).not.toHaveBeenCalled();
  });

  it('stays silent while idle so a resume with no episode cannot claim Now Playing', async () => {
    const harness = await render();

    expect(audio.player.setActiveForLockScreen).not.toHaveBeenCalled();

    await setPlaying(harness, true);

    expect(harness.current().nowPlaying).toBeNull();
    expect(audio.player.setActiveForLockScreen).not.toHaveBeenCalled();
    expect(audio.player.updateLockScreenMetadata).not.toHaveBeenCalled();
  });
});
