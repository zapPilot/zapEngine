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
