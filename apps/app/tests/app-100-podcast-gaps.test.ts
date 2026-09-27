// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import {
  fetchPodcastCatalog,
  fetchPodcastEpisode,
  fetchPodcastEpisodeSearchResults,
  fetchPodcastEpisodes,
  isPodcastVideoGenerationPending,
  mergePodcastEpisodeVideo,
  parsePodcastAudioTrack,
  parsePodcastClassroomTrack,
  parsePodcastEpisode,
  parsePodcastEpisodeRouteParams,
  parsePodcastEpisodeSearchResult,
  parsePodcastLanguageClassroomKeyword,
  parsePodcastLanguageClassroomLesson,
  podcastVideoRefetchInterval,
  usePodcastCatalog,
  usePodcastEpisode,
  usePodcastEpisodeSearch,
  usePodcastEpisodes,
} from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import type { PodcastPlaybackSection } from '@/integration/podcastSections';
import { usePodcastPlayer } from '@/integration/podcastPlayer.web';
import {
  createPodcastEpisodeFactory,
  createPodcastVideoGeneration,
} from './support/podcastEpisode';

/* ------------------------------------------------------------------ */
/* Shared hoisted mocks (player + feed hooks in one file)              */
/* ------------------------------------------------------------------ */

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

const queryCapture = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));

const langState = vi.hoisted(() => ({
  isHydrated: false,
  languageCode: 'en',
}));

const testFlags = vi.hoisted(() => ({
  onRegister: null as null | (() => void),
  forceFindSection: null as null | PodcastPlaybackSection,
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
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: queryCapture.useQuery };
});
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => langState,
}));
vi.mock('@/integration/podcastMediaSession', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/integration/podcastMediaSession')>();
  return {
    ...actual,
    registerPodcastMediaSessionHandlers: (
      mediaSession: unknown,
      handlers: unknown,
    ) => {
      testFlags.onRegister?.();
      return (
        actual as unknown as {
          registerPodcastMediaSessionHandlers: (
            ms: unknown,
            h: unknown,
          ) => () => void;
        }
      ).registerPodcastMediaSessionHandlers(mediaSession, handlers);
    },
  };
});
vi.mock('@/integration/podcastSections', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/integration/podcastSections')>();
  return {
    ...actual,
    findPlaybackSection: (...args: unknown[]) => {
      if (testFlags.forceFindSection !== null) {
        return testFlags.forceFindSection;
      }
      return (actual.findPlaybackSection as (...a: unknown[]) => unknown)(
        ...args,
      );
    },
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ */
/* Web audio + media-session doubles                                   */
/* ------------------------------------------------------------------ */

class FakeAudio {
  static instances: FakeAudio[] = [];
  static onTimeSet: ((audio: FakeAudio) => void) | null = null;

  paused = true;
  duration = Number.NaN;
  readyState = 0;
  playbackRate = 1;
  src = '';
  nativeHlsSupport = 'maybe';
  private listeners = new Map<string, Set<() => void>>();
  private timeValue = 0;

  get currentTime(): number {
    return this.timeValue;
  }

  set currentTime(value: number) {
    FakeAudio.onTimeSet?.(this);
    this.timeValue = value;
  }

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

const fetchMock = vi.fn();

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function lastQueryOptions(): Record<string, unknown> {
  const options = queryCapture.useQuery.mock.calls.at(-1)?.[0];
  if (typeof options !== 'object' || options === null) {
    throw new Error('Expected podcast hook to call useQuery with options');
  }
  return options as Record<string, unknown>;
}

const feedEpisodeFactory = createPodcastEpisodeFactory({
  id: 'ep-1',
  localizationId: 'loc-1',
  title: 'Fed rate decision explained',
  hlsUrl: 'https://cdn.example.com/ep-1/playlist.m3u8',
  createdAt: '2026-07-01T00:00:00.000Z',
});

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

const mainOnlyFactory = createPodcastEpisodeFactory({
  id: 'solo-1',
  localizationId: 'solo-loc-1',
  title: 'Solo episode',
  hlsUrl: 'https://cdn.example/solo.m3u8',
  audioTracks: [
    {
      languageCode: 'en',
      title: 'Solo episode',
      hlsUrl: 'https://cdn.example/solo.m3u8',
      classroomHlsUrl: null,
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
  FakeAudio.onTimeSet = null;
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
  testFlags.onRegister = null;
  testFlags.forceFindSection = null;
  queryCapture.useQuery.mockReturnValue(undefined);
  langState.isHydrated = false;
  langState.languageCode = 'en';
  fetchMock.mockReset();
  delete process.env['VITE_PODCAST_API_URL'];
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
  vi.stubGlobal('fetch', fetchMock);
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
  delete (window.navigator as unknown as { mediaSession?: unknown })
    .mediaSession;
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/* podcastFeed: defensive parser gaps                                  */
/* ------------------------------------------------------------------ */

describe('app-100 podcast feed parser gaps', () => {
  it('rejects non-record audio tracks, keywords, lessons, and episodes', () => {
    expect(parsePodcastAudioTrack(null)).toBeNull();
    expect(parsePodcastAudioTrack('track')).toBeNull();
    expect(parsePodcastAudioTrack([])).toBeNull();

    expect(parsePodcastLanguageClassroomKeyword(null)).toBeNull();
    expect(parsePodcastLanguageClassroomKeyword(42)).toBeNull();

    expect(parsePodcastLanguageClassroomLesson(null)).toBeNull();
    expect(parsePodcastLanguageClassroomLesson('lesson')).toBeNull();

    expect(() => parsePodcastEpisode(null)).toThrow(
      'Podcast episode must be an object',
    );
    expect(() => parsePodcastEpisode('nope')).toThrow(
      'Podcast episode must be an object',
    );
    expect(() => parsePodcastEpisode([])).toThrow(
      'Podcast episode must be an object',
    );
  });

  it('rejects episodes with a missing or blank id', () => {
    expect(() => parsePodcastEpisode({})).toThrow(
      'Podcast episode is missing id',
    );
    expect(() => parsePodcastEpisode({ id: '   ' })).toThrow(
      'Podcast episode is missing id',
    );
    expect(() => parsePodcastEpisode({ id: 42 })).toThrow(
      'Podcast episode is missing id',
    );
  });

  it('rejects blank classroom keyword and lesson fields', () => {
    expect(
      parsePodcastLanguageClassroomKeyword({ term: '  ', meaning: 'rate' }),
    ).toBeNull();
    expect(
      parsePodcastLanguageClassroomKeyword({ term: '金利', meaning: '' }),
    ).toBeNull();

    expect(
      parsePodcastLanguageClassroomLesson({
        targetLanguageCode: '  ',
        oneLiner: 'Learn something.',
      }),
    ).toBeNull();
    expect(
      parsePodcastLanguageClassroomLesson({
        targetLanguageCode: 'ja',
        oneLiner: '   ',
      }),
    ).toBeNull();
  });

  it('parses lessons without keywords and filters invalid entries', () => {
    const parsed = parsePodcastLanguageClassroomLesson({
      sourceLanguageCode: 'en',
      targetLanguageCode: 'ja',
      oneLiner: 'Word of the day.',
      keywords: [
        { term: '金利', meaning: 'interest rate' },
        { term: '', meaning: 'blank term' },
        null,
      ],
    });
    expect(parsed?.keywords.map((k) => k.term)).toEqual(['金利']);
  });

  it('falls back to the default language when the code is blank', () => {
    const parsed = parsePodcastEpisode({
      id: 'ep-blank-lang',
      title: 'Blank lang',
      language_code: '   ',
      hls_url: 'https://cdn.example.com/blank.m3u8',
    });
    expect(parsed.languageCode).toBe('zh-Hant');
  });

  it('falls back to the language code when the track title is absent', () => {
    expect(
      parsePodcastAudioTrack({
        languageCode: 'en',
        hlsUrl: 'https://cdn.example.com/en.m3u8',
      }),
    ).toMatchObject({ languageCode: 'en', title: 'en' });
  });

  it('ignores non-numeric like counts, including masked snake_case values', () => {
    expect(
      parsePodcastEpisode(feedEpisodeFactory({ likeCount: '7', like_count: 5 }))
        .likeCount,
    ).toBe(0);
    expect(
      parsePodcastEpisode(feedEpisodeFactory({ likeCount: Number.NaN }))
        .likeCount,
    ).toBe(0);
    expect(
      parsePodcastEpisode(
        feedEpisodeFactory({ likeCount: Number.POSITIVE_INFINITY }),
      ).likeCount,
    ).toBe(0);
    expect(parsePodcastEpisode(feedEpisodeFactory({})).likeCount).toBe(0);
  });

  it('rejects malformed search results and unknown match sources', () => {
    expect(() => parsePodcastEpisodeSearchResult(null)).toThrow(
      'Podcast search result must be an object',
    );
    expect(() =>
      parsePodcastEpisodeSearchResult({
        episode: feedEpisodeFactory(),
        matchSource: 'author',
        snippet: null,
      }),
    ).toThrow('Unknown podcast search match source: author');
    expect(() =>
      parsePodcastEpisodeSearchResult({
        episode: feedEpisodeFactory(),
        snippet: null,
      }),
    ).toThrow('Unknown podcast search match source: ');
  });

  it('normalises empty route arrays and language fallbacks', () => {
    expect(
      parsePodcastEpisodeRouteParams(
        { episodeId: [], lang: [], language: [] },
        'zh-Hant',
      ),
    ).toEqual({ episodeId: '', languageCode: 'zh-Hant' });
    expect(parsePodcastEpisodeRouteParams({}, 'en')).toEqual({
      episodeId: '',
      languageCode: 'en',
    });
    expect(
      parsePodcastEpisodeRouteParams(
        { episodeId: 'loc-1', lang: '', language: 'ja' },
        'zh-Hant',
      ),
    ).toEqual({ episodeId: 'loc-1', languageCode: 'ja' });
    expect(
      parsePodcastEpisodeRouteParams(
        { episodeId: 'loc-1', lang: 'en', language: 'ja' },
        'zh-Hant',
      ),
    ).toEqual({ episodeId: 'loc-1', languageCode: 'en' });
  });

  it('treats null, missing, and invalid generation timestamps as stale', () => {
    const fresh = parsePodcastEpisode(
      feedEpisodeFactory({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: '2026-07-01T00:20:00.000Z',
          progressPercent: 80,
        },
      }),
    );
    const nullStamp = parsePodcastEpisode(
      feedEpisodeFactory({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: null,
          progressPercent: 10,
        },
      }),
    );
    const invalidStamp = parsePodcastEpisode(
      feedEpisodeFactory({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: 'not-a-date',
          progressPercent: 10,
        },
      }),
    );

    // Null/invalid candidate timestamps never count as newer than the current.
    expect(
      mergePodcastEpisodeVideo(nullStamp, fresh)?.videoGeneration
        ?.progressPercent,
    ).toBe(80);
    expect(
      mergePodcastEpisodeVideo(invalidStamp, fresh)?.videoGeneration
        ?.progressPercent,
    ).toBe(80);
    // A null current timestamp also fails the both-non-null freshness gate.
    expect(
      mergePodcastEpisodeVideo(fresh, nullStamp)?.videoGeneration
        ?.progressPercent,
    ).toBe(10);
  });

  it('falls back to feed fields when both generations are absent', () => {
    const feedEpisode = parsePodcastEpisode(
      feedEpisodeFactory({ video: null, videoGeneration: null }),
    );
    const detailEpisode = parsePodcastEpisode(
      feedEpisodeFactory({ video: null, videoGeneration: null }),
    );
    expect(mergePodcastEpisodeVideo(feedEpisode, detailEpisode)).toMatchObject({
      video: null,
      videoGeneration: null,
    });
  });

  it('polls through a null detail episode and terminal failures', () => {
    const pending = createPodcastVideoGeneration({
      status: 'processing',
      updatedAt: '2026-07-01T00:20:00.000Z',
    });
    expect(podcastVideoRefetchInterval(null, pending)).toBe(20_000);
    expect(
      isPodcastVideoGenerationPending({
        video: null,
        videoGeneration: null,
      }),
    ).toBe(false);
    expect(
      parsePodcastClassroomTrack({ languageCode: 'ja', hlsUrl: '' }),
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* podcastFeed: hook queryFn / refetchInterval gaps                    */
/* ------------------------------------------------------------------ */

describe('app-100 podcast feed hook gaps', () => {
  it('runs the episodes queryFn against the feed endpoint', async () => {
    langState.isHydrated = true;
    langState.languageCode = 'ja';
    fetchMock.mockResolvedValue(
      jsonResponse({ items: [feedEpisodeFactory()], nextCursor: null }),
    );
    usePodcastEpisodes();
    const options = lastQueryOptions();
    const queryFn = options['queryFn'] as () => Promise<PodcastEpisode[]>;
    const episodes = await queryFn();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(episodes).toHaveLength(1);
    expect(await fetchPodcastEpisodes(fetchMock, 'ja')).toHaveLength(1);
  });

  it('runs the catalog queryFn', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ languages: { en: ['a'] } }));
    usePodcastCatalog();
    const options = lastQueryOptions();
    const queryFn = options['queryFn'] as () => Promise<unknown>;
    await queryFn();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(fetchPodcastCatalog(fetchMock)).resolves.toEqual({
      languages: { en: ['a'] },
    });
  });

  it('runs the episode queryFn and its video refetch interval', async () => {
    langState.isHydrated = true;
    const pending = createPodcastVideoGeneration({
      status: 'processing',
      updatedAt: '2026-07-01T00:20:00.000Z',
    });
    fetchMock.mockResolvedValue(jsonResponse(feedEpisodeFactory()));
    usePodcastEpisode('loc-1', 'en', true, pending);
    const options = lastQueryOptions();
    const queryFn = options['queryFn'] as () => Promise<PodcastEpisode>;
    await expect(queryFn()).resolves.toMatchObject({ id: 'ep-1' });
    await expect(
      fetchPodcastEpisode('loc-1', fetchMock, 'en'),
    ).resolves.toMatchObject({
      id: 'ep-1',
    });

    const refetchInterval = options['refetchInterval'] as (
      query: unknown,
    ) => number | false;
    const pendingEpisode = parsePodcastEpisode(
      feedEpisodeFactory({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: '2026-07-01T00:20:00.000Z',
        },
      }),
    );
    expect(
      refetchInterval({
        state: { data: pendingEpisode, fetchFailureCount: 0 },
      }),
    ).toBe(20_000);
    expect(
      refetchInterval({ state: { data: null, fetchFailureCount: 0 } }),
    ).toBe(20_000);
    expect(
      refetchInterval({
        state: {
          data: parsePodcastEpisode(
            feedEpisodeFactory({
              video: null,
              videoGeneration: {
                status: 'failed',
                updatedAt: '2026-07-01T00:25:00.000Z',
              },
            }),
          ),
          fetchFailureCount: 0,
        },
      }),
    ).toBe(false);
  });

  it('runs the search queryFn', async () => {
    langState.isHydrated = true;
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          {
            episode: feedEpisodeFactory(),
            matchSource: 'title',
            snippet: 'hi',
          },
        ],
      }),
    );
    usePodcastEpisodeSearch('fed');
    const options = lastQueryOptions();
    const queryFn = options['queryFn'] as () => Promise<unknown[]>;
    const results = await queryFn();
    expect(results).toHaveLength(1);
    await expect(
      fetchPodcastEpisodeSearchResults('fed', fetchMock),
    ).resolves.toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* podcastPlayer.web: missing-platform and handoff gaps                */
/* ------------------------------------------------------------------ */

describe('app-100 web player platform gaps', () => {
  it('plays without a mediaSession and skips position sync', async () => {
    delete (window.navigator as unknown as { mediaSession?: unknown })
      .mediaSession;
    const harness = await render();
    await act(async () => queue.args?.playEpisode(episode));
    expect(harness.current().nowPlaying).toBe(episode);

    await act(async () => {
      const element = audio();
      element.currentTime = 10;
      element.duration = 100;
      element.readyState = 1;
      element.emit('durationchange');
    });
    expect(mediaSession.setPositionState).not.toHaveBeenCalled();
    expect(harness.current()).toMatchObject({ duration: 100 });
  });

  it('plays without MediaMetadata support', async () => {
    delete (globalThis as unknown as { MediaMetadata?: unknown }).MediaMetadata;
    const harness = await render();
    await act(async () => queue.args?.playEpisode(episode));
    expect(harness.current().nowPlaying).toBe(episode);
  });

  it('treats a non-finite duration as unknown', async () => {
    const harness = await render();
    await act(async () => queue.args?.playEpisode(episode));
    await act(async () => audio().emit('durationchange'));
    expect(harness.current().duration).toBe(0);
  });

  it('publishes artwork when a video thumbnail exists', async () => {
    const harness = await render();
    const withVideo = makeEpisode({
      id: 'art-1',
      localizationId: 'art-loc-1',
      video: {
        url: 'https://cdn.example/video.mp4',
        thumbnailUrl: 'https://cdn.example/thumb.png',
        durationSeconds: 90,
      },
    });
    await act(async () => queue.args?.playEpisode(withVideo));
    expect(mediaSession.metadata?.init).toMatchObject({
      artwork: [{ src: 'https://cdn.example/thumb.png' }],
    });
    expect(harness.current().nowPlaying).toBe(withVideo);
  });

  it('drops a section handoff when no HLS support exists', async () => {
    const harness = await render();
    const element = audio();
    element.nativeHlsSupport = '';
    hls.FakeHls.isSupported.mockReturnValue(false);
    const section: PodcastPlaybackSection = {
      kind: 'classroom',
      hlsUrl: 'https://cdn.example/classroom.m3u8',
      languageCode: null,
    };
    act(() => queue.args?.playEpisodeSection(episode, section, 12, true));
    expect(harness.current().nowPlaying).toBeNull();
    expect(element.play).not.toHaveBeenCalled();
  });

  it('drops an episode-at handoff when the replacement source is unsupported', async () => {
    const harness = await render();
    const element = audio();
    element.nativeHlsSupport = '';
    hls.FakeHls.isSupported.mockReturnValue(false);
    act(() => queue.args?.playEpisodeAt(nextEpisode, 10, true));
    expect(harness.current().nowPlaying).toBeNull();
    expect(element.play).not.toHaveBeenCalled();
  });

  it('ignores a stale handoff superseded before metadata arrives', async () => {
    const harness = await render();
    const element = audio();
    act(() => queue.args?.playEpisodeAt(episode, 50, true));
    expect(harness.current().nowPlaying).toBe(episode);
    expect(element.play).not.toHaveBeenCalled();

    FakeAudio.onTimeSet = () => {
      FakeAudio.onTimeSet = null;
      harness.current().pause();
    };
    element.duration = 100;
    element.readyState = 1;
    await act(async () => element.emit('loadedmetadata'));
    FakeAudio.onTimeSet = null;

    expect(element.currentTime).toBe(50);
    expect(element.play).not.toHaveBeenCalled();
    expect(element.pause).toHaveBeenCalled();
  });

  it('invokes the idle ended handler registered before queue wiring', async () => {
    testFlags.onRegister = () => {
      FakeAudio.instances.at(-1)?.emit('ended');
    };
    const harness = await render();
    testFlags.onRegister = null;
    expect(harness.current().nowPlaying).toBeNull();
  });
});

describe('app-100 web player null-audio and queue-edge gaps', () => {
  it('ignores remote commands after the element is destroyed', async () => {
    const harness = await render();
    await act(async () => queue.args?.playEpisode(episode));
    const seekBackward = mediaSession.handlers.get('seekbackward');
    const seekForward = mediaSession.handlers.get('seekforward');
    const play = mediaSession.handlers.get('play');
    expect(seekBackward).not.toBeNull();
    expect(seekForward).not.toBeNull();

    await act(async () => harness.root.unmount());
    harness.container.remove();
    active = null;

    expect(() => seekBackward?.()).not.toThrow();
    expect(() => seekForward?.()).not.toThrow();
    expect(() => play?.()).not.toThrow();
  });

  it('ignores forward seeks while duration is unknown', async () => {
    await render();
    const element = audio();
    element.currentTime = 8;
    element.duration = 0;
    act(() => mediaSession.handlers.get('seekforward')?.());
    expect(element.currentTime).toBe(8);
  });

  it('ignores playback actions after unmount', async () => {
    const harness = await render();
    await act(async () => queue.args?.playEpisode(episode));
    const element = audio();
    element.play.mockClear();
    element.pause.mockClear();
    const args = queue.args;
    const seek = harness.current().seek;
    const setSpeed = harness.current().setSpeed;
    const pause = harness.current().pause;

    await act(async () => harness.root.unmount());
    harness.container.remove();
    active = null;

    args?.playEpisode(nextEpisode);
    args?.playEpisodeAt(nextEpisode, 5, true);
    args?.playEpisodeSection(
      nextEpisode,
      { kind: 'main', hlsUrl: nextEpisode.hlsUrl, languageCode: null },
      0,
      true,
    );
    args?.toggleCurrentPlayback();
    seek(10);
    pause();
    setSpeed(2);
    expect(element.play).not.toHaveBeenCalled();
    expect(speed.setSpeedForSection).toHaveBeenCalledWith('main', 2);
  });

  it('stops quietly when the queue and sections are exhausted', async () => {
    const harness = await render();
    queue.state.queue = [];
    queue.state.queueIndex = -1;
    act(() => audio().emit('ended'));
    expect(queue.state.skipToNextEpisode).not.toHaveBeenCalled();
    expect(harness.current().nowPlaying).toBeNull();
  });

  it('keeps main playback when a classroom section does not exist', async () => {
    const harness = await render();
    const solo = mainOnlyFactory();
    await act(async () => queue.args?.playEpisode(solo));
    const element = audio();
    const src = element.src;
    act(() => harness.current().skipToSection('classroom'));
    expect(harness.current().currentSection).toBe('main');
    expect(element.src).toBe(src);
  });

  it('clears lock-screen position state while duration is unknown', async () => {
    await render();
    await act(async () => queue.args?.playEpisode(episode));
    expect(mediaSession.setPositionState).toHaveBeenCalledWith(undefined);
  });

  it('drops section jumps while no episode is loaded', async () => {
    const harness = await render();
    testFlags.forceFindSection = {
      kind: 'classroom',
      hlsUrl: 'https://cdn.example/classroom.m3u8',
      languageCode: null,
    };
    const element = audio();
    act(() => harness.current().skipToSection('classroom'));
    testFlags.forceFindSection = null;
    expect(harness.current().nowPlaying).toBeNull();
    expect(element.play).not.toHaveBeenCalled();
  });
});
