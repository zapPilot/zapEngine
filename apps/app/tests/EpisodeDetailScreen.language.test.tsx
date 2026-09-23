// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EpisodeDetailScreen } from '@/screens/EpisodeDetailScreen';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import { createPodcastEpisode } from './support/podcastEpisode';

const state = vi.hoisted(() => ({
  globalLang: 'zh-Hant',
  routeId: 'ep-shared',
  routeLang: 'ja',
  feedData: [] as PodcastEpisode[],
  detailData: null as PodcastEpisode | null,
  detailCalls: [] as {
    localizationId: string;
    languageCode: string;
  }[],
  player: {
    nowPlaying: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    speed: 1,
    currentSection: 'main',
    currentSectionLanguage: null,
    pause: vi.fn(),
    playSectionFromQueue: vi.fn(),
  },
}));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} />,
  ActivityIndicator: () => <span>loading</span>,
  RefreshControl: () => null,
  TextInput: () => <input />,
  Platform: { OS: 'ios' },
  AccessibilityInfo: { announceForAccessibility: vi.fn() },
  Share: { share: vi.fn() },
}));
vi.mock('lucide-react-native', () => ({
  ChevronLeft: () => null,
  Share2: () => null,
  Download: () => null,
  Trash2: () => null,
  X: () => null,
  Gauge: () => null,
  Pause: () => null,
  Play: () => null,
  RotateCcw: () => null,
  RotateCw: () => null,
  SkipBack: () => null,
  SkipForward: () => null,
  Search: () => null,
  ChevronDown: () => null,
  Headphones: () => null,
}));
vi.mock('@react-native-community/slider', () => ({ default: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0 }),
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    episodeId: state.routeId,
    lang: state.routeLang,
  }),
  useRouter: () => ({
    push: vi.fn(),
    canGoBack: () => false,
    replace: vi.fn(),
  }),
}));
vi.mock('@/providers/PodcastDownloadsProvider', () => ({
  usePodcastDownloads: () => ({
    records: [],
    isHydrated: true,
    isSupported: true,
    states: {},
    download: vi.fn(),
    remove: vi.fn(),
    localUri: (name: string) => `file:///documents/${name}`,
  }),
}));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    languageCode: state.globalLang,
    t: (key: string) => key,
  }),
}));
vi.mock('@/providers/PodcastProgressProvider', () => ({
  useEpisodeProgress: () => ({
    progress: {},
    isHydrated: true,
    markListened: vi.fn(),
    setPosition: vi.fn(),
    markAllListened: vi.fn(),
  }),
}));
vi.mock('@/providers/PodcastPlayerProvider', () => ({
  usePodcastPlayer: () => state.player,
  usePodcastPlayerStatus: () => state.player,
}));
vi.mock('@/integration/podcastFeed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/integration/podcastFeed')>()),
  usePodcastEpisodes: () => ({
    data: state.feedData,
    isError: false,
    isPending: false,
  }),
  usePodcastEpisode: (
    localizationId: string,
    languageCode: string,
    enabled = true,
  ) => {
    state.detailCalls.push({ localizationId, languageCode });
    void enabled;
    return { data: state.detailData, isError: false, isPending: false };
  },
  usePodcastCatalog: () => ({ isError: false, isPending: false }),
  usePodcastEpisodeSearch: () => ({ data: [] }),
}));
vi.mock('@/components/content/ContentLanguageSelector', () => ({
  PodcastLanguageDropdown: () => null,
}));
vi.mock('@/components/podcast/EpisodeTranscript', () => ({
  EpisodeTranscript: () => null,
}));
vi.mock('@/components/podcast/NowPlayingBar', () => ({
  NowPlayingBar: () => null,
}));
vi.mock('@/components/podcast/PlayUnheardCard', () => ({
  PlayUnheardCard: () => null,
}));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    onPress,
    accessibilityLabel,
    disabled,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    disabled?: boolean;
  }) => (
    <button
      aria-label={accessibilityLabel}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/ProgressBar', () => ({ ProgressBar: () => null }));
vi.mock('@/components/ui/PrimaryButton', () => ({
  PrimaryButton: ({
    children,
    onPress,
  }: {
    children: ReactNode;
    onPress: () => void;
  }) => <button onClick={onPress}>{children}</button>,
}));
vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/ScreenScrollView', () => ({
  ScreenScrollView: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('@/components/ui/ScreenHeader', () => ({ ScreenHeader: () => null }));
vi.mock('@/components/ui/Skeleton', () => ({
  SkeletonBlock: () => <div>Skeleton</div>,
}));
vi.mock('@/components/podcast/EpisodeVideoPlayer', () => ({
  EpisodeVideoPlayer: ({
    video,
  }: {
    video: { url: string; thumbnailUrl: string };
  }) => <video src={video.url} poster={video.thumbnailUrl} />,
}));
vi.mock('@/hooks/useEpisodeSortDirection', () => ({
  useEpisodeSortDirection: () => ({
    direction: 'newest',
    setDirection: vi.fn(),
  }),
}));

const zhFeedEpisode = () =>
  createPodcastEpisode({
    id: 'ep-shared',
    localizationId: 'loc-shared-zh',
    title: 'Shared episode zh title',
    languageCode: 'zh-Hant',
  });

const jaFeedEpisode = () =>
  createPodcastEpisode({
    id: 'ep-shared',
    localizationId: 'loc-shared-ja',
    title: 'Shared episode ja title',
    languageCode: 'ja',
  });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.globalLang = 'zh-Hant';
  state.routeId = 'ep-shared';
  state.routeLang = 'ja';
  state.feedData = [];
  state.detailData = null;
  state.detailCalls = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(node: ReactNode) {
  await act(async () => root.render(node));
}

describe('EpisodeDetailScreen shared-URL language precedence', () => {
  it('resolves the URL language instead of reusing the wrong-language feed episode', async () => {
    // Global feed is zh-Hant, inbound Universal Link is the same canonical
    // episode explicitly requesting Japanese.
    state.globalLang = 'zh-Hant';
    state.routeId = 'ep-shared';
    state.routeLang = 'ja';
    state.feedData = [zhFeedEpisode()];
    state.detailData = null;

    await render(<EpisodeDetailScreen />);

    // The detail request must carry the URL language and canonical ID so the
    // backend can resolve the Japanese localization. Reusing the zh-Hant
    // feed episode (loc-shared-zh/zh-Hant) would show the wrong language.
    expect(state.detailCalls.length).toBeGreaterThan(0);
    expect(state.detailCalls[0]).toEqual({
      localizationId: 'ep-shared',
      languageCode: 'ja',
    });
    expect(container.textContent).not.toContain('Shared episode zh title');
  });

  it('applies the same precedence in the inverse direction', async () => {
    state.globalLang = 'ja';
    state.routeId = 'ep-shared';
    state.routeLang = 'en';
    state.feedData = [jaFeedEpisode()];
    state.detailData = null;

    await render(<EpisodeDetailScreen />);

    expect(state.detailCalls.length).toBeGreaterThan(0);
    expect(state.detailCalls[0]).toEqual({
      localizationId: 'ep-shared',
      languageCode: 'en',
    });
    expect(container.textContent).not.toContain('Shared episode ja title');
  });

  it('reuses the feed episode when the URL and feed languages match', async () => {
    state.globalLang = 'zh-Hant';
    state.routeId = 'ep-shared';
    state.routeLang = 'zh-Hant';
    state.feedData = [zhFeedEpisode()];
    state.detailData = null;

    await render(<EpisodeDetailScreen />);

    expect(state.detailCalls.length).toBeGreaterThan(0);
    expect(state.detailCalls[0]).toEqual({
      localizationId: 'loc-shared-zh',
      languageCode: 'zh-Hant',
    });
    expect(container.textContent).toContain('Shared episode zh title');
  });
});
