// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadedEpisodesSection } from '@/components/podcast/DownloadedEpisodesSection';
import type { EpisodeSortDirection } from '@/components/podcast/episodeSorting';
import { downloadRecord } from './support/podcastDownload';

const MB = 1024 * 1024;

const harness = vi.hoisted(() => ({
  downloads: {} as Record<string, unknown>,
  progress: {} as Record<string, unknown>,
  remove: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} />,
  Platform: { OS: 'ios' },
}));
vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock('@/providers/PodcastDownloadsProvider', () => ({
  usePodcastDownloads: () => harness.downloads,
}));
vi.mock('@/providers/PodcastProgressProvider', () => ({
  useEpisodeProgress: () => ({ progress: harness.progress }),
}));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    languageCode: 'en',
    t: (key: string, params?: object) =>
      params === undefined ? key : `${key}|${JSON.stringify(params)}`,
  }),
}));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/ProgressBar', () => ({
  ProgressBar: ({
    value,
    accessibilityLabel,
  }: {
    value: number;
    accessibilityLabel: string;
  }) => <progress value={value} max={100} aria-label={accessibilityLabel} />,
}));
vi.mock('@/components/ui/ConfirmSheet', () => ({
  ConfirmSheet: ({
    visible,
    body,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onClose,
  }: {
    visible: boolean;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onClose: () => void;
  }) =>
    visible ? (
      <div role="dialog">
        <p>{body}</p>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onClose}>{cancelLabel}</button>
      </div>
    ) : null,
}));

const alpha = downloadRecord({
  localizationId: 'alpha',
  title: 'Alpha',
  createdAt: '2026-03-02T00:00:00Z',
  byteSize: 69 * MB,
  durationSeconds: 61,
});
const beta = downloadRecord({
  localizationId: 'beta',
  title: 'Beta',
  createdAt: '2026-03-01T00:00:00Z',
  byteSize: 41 * MB,
  durationSeconds: 3725,
});
/** A transfer in flight, as the provider's state describes it. */
const runningState = (progress: number, title = 'Pending one') => ({
  status: 'downloading',
  progress,
  title,
  thumbnailUrl: 'https://example.com/pending.jpg',
  durationSeconds: 125,
});

function setDownloads(overrides: Record<string, unknown> = {}) {
  harness.downloads = {
    records: [],
    isHydrated: true,
    isSupported: true,
    states: {},
    remove: harness.remove,
    cancel: harness.cancel,
    localUri: (name: string) => `file:///documents/${name}`,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
const onOpenEpisode = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  harness.remove.mockClear();
  harness.cancel.mockClear();
  onOpenEpisode.mockClear();
  harness.progress = {};
  setDownloads();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(direction: EpisodeSortDirection = 'newest') {
  await act(async () =>
    root.render(
      <DownloadedEpisodesSection
        direction={direction}
        onOpenEpisode={onOpenEpisode}
      />,
    ),
  );
}
const click = (element: Element) =>
  act(async () =>
    element.dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
const byLabel = (prefix: string) =>
  [...container.querySelectorAll('button')].filter((candidate) =>
    candidate.getAttribute('aria-label')?.startsWith(prefix),
  );
const openLabels = () =>
  byLabel('podcast.openEpisode').map((row) => row.getAttribute('aria-label'));
const buttonNamed = (name: string) =>
  [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === name,
  )!;

describe('DownloadedEpisodesSection', () => {
  it.each([
    ['a platform that cannot download', { isSupported: false }],
    ['a manifest still loading', { isHydrated: false }],
  ])('renders nothing for %s', async (_name, context) => {
    setDownloads({ ...context, records: [alpha] });
    await render();
    expect(container.textContent).toBe('');
  });

  it('invites the first download when nothing is saved', async () => {
    await render();
    expect(container.textContent).toContain('podcast.downloadsEmptyTitle');
    expect(container.textContent).toContain('podcast.downloadsEmptyMessage');
    expect(container.textContent).toContain('(0)');
    expect(container.textContent).not.toContain('podcast.downloadsScope');
  });

  it('lists saved videos with size, duration and a local thumbnail, plus the total', async () => {
    setDownloads({ records: [beta, alpha] });
    await render();
    const text = container.textContent ?? '';
    expect(text).toContain('podcast.downloads');
    expect(text).toContain('(2)');
    expect(text).toContain('110 MB');
    expect(text).toContain('69 MB');
    expect(text).toContain('41 MB');
    expect(text).toContain('1:01');
    expect(text).toContain('62:05');
    expect(text).toContain('podcast.downloadsScope');
    expect(
      [...container.querySelectorAll('img')].map((img) => img.src),
    ).toEqual([
      `file:///documents/${alpha.thumbnailFileName}`,
      `file:///documents/${beta.thumbnailFileName}`,
    ]);
  });

  it('follows the episode order the screen is sorted by', async () => {
    setDownloads({ records: [beta, alpha] });
    await render('newest');
    expect(openLabels()).toEqual([
      'podcast.openEpisode|{"title":"Alpha"}',
      'podcast.openEpisode|{"title":"Beta"}',
    ]);
    await render('oldest');
    expect(openLabels()).toEqual([
      'podcast.openEpisode|{"title":"Beta"}',
      'podcast.openEpisode|{"title":"Alpha"}',
    ]);
  });

  it('marks only the completed episodes', async () => {
    harness.progress = { alpha: { listened: true, lastPositionSeconds: 0 } };
    setDownloads({ records: [alpha, beta] });
    await render();
    expect(
      container.textContent?.match(/podcast\.completedEpisode/g),
    ).toHaveLength(1);
  });

  it('opens an episode from its row', async () => {
    setDownloads({ records: [alpha] });
    await render();
    await click(byLabel('podcast.openEpisode')[0]!);
    expect(onOpenEpisode).toHaveBeenCalledWith(alpha);
  });

  it('removes a video only after confirming, and says how much it frees', async () => {
    setDownloads({ records: [alpha, beta] });
    await render();
    await click(byLabel('podcast.removeDownloadFor|{"title":"Beta"}')[0]!);
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      'podcast.downloadRemoveMessage|{"size":"41 MB"}',
    );
    expect(harness.remove).not.toHaveBeenCalled();

    await click(buttonNamed('common.cancel'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.remove).not.toHaveBeenCalled();

    await click(byLabel('podcast.removeDownloadFor|{"title":"Beta"}')[0]!);
    await click(buttonNamed('podcast.downloadRemoveConfirm'));
    expect(harness.remove).toHaveBeenCalledExactlyOnceWith('beta');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows running downloads first, named by their own state, and cancels them', async () => {
    setDownloads({
      records: [alpha],
      states: {
        pending: runningState(0.5),
        // Older than any loaded feed page: the shelf must not need the feed.
        older: runningState(0.2, 'Older one'),
      },
    });
    await render();
    const bars = [...container.querySelectorAll('progress')];
    expect(bars.map((bar) => bar.value)).toEqual([50, 20]);
    expect(bars[0]!.getAttribute('aria-label')).toBe(
      'podcast.downloadStatusDownloading|{"percent":50}',
    );
    expect(container.textContent).toContain('Pending one');
    expect(container.textContent).toContain('Older one');
    expect(container.textContent).toContain('2:05');
    expect([...container.querySelectorAll('img')][0]?.src).toBe(
      'https://example.com/pending.jpg',
    );
    // The running downloads sit above the saved ones.
    const labels = [...container.querySelectorAll('button')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(
      labels.indexOf('podcast.cancelDownloadFor|{"title":"Older one"}'),
    ).toBeLessThan(labels.indexOf('podcast.openEpisode|{"title":"Alpha"}'));

    await click(byLabel('podcast.cancelDownloadFor|{"title":"Older one"}')[0]!);
    expect(harness.cancel).toHaveBeenCalledExactlyOnceWith('older');
  });

  it('shows a running download instead of the empty state, with no total yet', async () => {
    setDownloads({ states: { pending: runningState(0.1) } });
    await render();
    expect(container.textContent).not.toContain('podcast.downloadsEmptyTitle');
    expect(container.textContent).toContain('(0)');
    expect(container.textContent).not.toContain(' MB');
  });
});
