// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EpisodeDetailScreen } from '@/screens/EpisodeDetailScreen';
import { PodcastScreen } from '@/screens/PodcastScreen';
import { EpisodeDownloadButton } from '@/components/podcast/EpisodeDownloadButton';
import { downloadRecord, downloadableEpisode } from './support/podcastDownload';

const state = vi.hoisted(() => ({
  records: [] as unknown[],
  data: undefined as unknown,
  pending: false,
  routeId: 'episode-1-zh-Hant',
  lang: 'zh-Hant',
  push: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
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
  progress: {
    progress: {},
    isHydrated: true,
    markListened: vi.fn(),
    setPosition: vi.fn(),
    markAllListened: vi.fn(),
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
  useLocalSearchParams: () => ({ episodeId: state.routeId, lang: state.lang }),
  useRouter: () => ({
    push: state.push,
    canGoBack: () => false,
    replace: vi.fn(),
  }),
}));
vi.mock('@/providers/PodcastDownloadsProvider', () => ({
  usePodcastDownloads: () => ({
    records: state.records,
    isHydrated: true,
    isSupported: true,
    states: {},
    download: state.download,
    remove: state.remove,
    localUri: (name: string) => `file:///documents/${name}`,
  }),
}));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    languageCode: 'zh-Hant',
    t: (key: string) => key,
  }),
}));
vi.mock('@/providers/PodcastProgressProvider', () => ({
  useEpisodeProgress: () => state.progress,
}));
vi.mock('@/providers/PodcastPlayerProvider', () => ({
  usePodcastPlayer: () => state.player,
  usePodcastPlayerStatus: () => state.player,
}));
vi.mock('@/integration/podcastFeed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/integration/podcastFeed')>()),
  usePodcastEpisodes: () => ({
    data: state.data,
    isError: !state.data,
    isPending: state.pending,
  }),
  usePodcastEpisode: () => ({ isError: true, isPending: state.pending }),
  usePodcastCatalog: () => ({ isError: true, isPending: false }),
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
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.records = [downloadRecord()];
  state.data = undefined;
  state.pending = false;
  state.routeId = downloadableEpisode.localizationId;
  state.lang = downloadableEpisode.languageCode;
  state.push.mockClear();
  state.download.mockClear();
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
describe('offline podcast UI', () => {
  it('renders a local snapshot after both queries fail and plays the local video and poster', async () => {
    await render(<EpisodeDetailScreen />);
    expect(container.textContent).toContain('Episode');
    const play = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Play video',
    );
    expect(play).toBeDefined();
    await act(async () => play!.click());
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe(
      `file:///documents/${downloadRecord().videoFileName}`,
    );
    expect(video?.getAttribute('poster')).toBe(
      `file:///documents/${downloadRecord().thumbnailFileName}`,
    );
  });
  it('does not wait for a stalled network request before rendering downloads', async () => {
    state.pending = true;
    await render(<EpisodeDetailScreen />);
    expect(container.textContent).toContain('Play video');
    expect(container.textContent).not.toContain('Skeleton');
  });
  it('matches episode-id routes only in the requested language', async () => {
    state.routeId = downloadableEpisode.id;
    state.lang = 'en';
    await render(<EpisodeDetailScreen />);
    expect(container.textContent).not.toContain('Play video');
  });
  it('shows downloads and opens a local episode even when the feed is unavailable', async () => {
    await render(<PodcastScreen />);
    expect(container.textContent).toContain('Downloaded');
    expect(container.textContent).toContain('Main narration video only');
    const open = container.querySelector<HTMLButtonElement>(
      'button[aria-label="podcast.openEpisode"]',
    );
    expect(open).not.toBeNull();
    await act(async () => open!.click());
    expect(state.push).toHaveBeenCalledWith(
      `/podcast/${downloadableEpisode.localizationId}?lang=zh-Hant`,
    );
  });
  it('visibly disables downloads for episodes with no video', async () => {
    state.records = [];
    await render(
      <EpisodeDownloadButton
        episode={{ ...downloadableEpisode, video: null }}
      />,
    );
    expect(container.textContent).toContain('No video to download');
    const button = container.querySelector('button');
    expect(button?.disabled).toBe(true);
    await act(async () => button!.click());
    expect(state.download).not.toHaveBeenCalled();
  });
});
