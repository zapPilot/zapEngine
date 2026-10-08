// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EpisodeDownloadButton } from '@/components/podcast/EpisodeDownloadButton';
import { EpisodeDownloadStatus } from '@/components/podcast/EpisodeDownloadStatus';
import type { PodcastDownloadState } from '@/integration/podcastVideoDownloads';
import { downloadRecord, downloadableEpisode } from './support/podcastDownload';

const MB_69 = 72_351_744;
const id = downloadableEpisode.localizationId;

const downloads = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  download: vi.fn(),
  remove: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Platform: { OS: 'ios' },
}));
vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock('@/providers/PodcastDownloadsProvider', () => ({
  usePodcastDownloads: () => downloads.current,
}));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    t: (key: string, params?: object) =>
      params === undefined ? key : `${key}|${JSON.stringify(params)}`,
  }),
}));
vi.mock('@/components/podcast/EpisodeMediaPlayer', () => ({
  PodcastIconButton: ({
    label,
    hint,
    tone,
    busy,
    disabled,
    onPress,
    children,
  }: {
    label: string;
    hint?: string;
    tone: string;
    busy: boolean;
    disabled: boolean;
    onPress: () => void;
    children: ReactNode;
  }) => (
    <button
      aria-label={label}
      data-hint={hint}
      data-tone={tone}
      data-busy={String(busy)}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/ProgressRing', () => ({
  ProgressRing: ({
    value,
    children,
  }: {
    value: number;
    children?: ReactNode;
  }) => <i data-ring={String(value)}>{children}</i>,
}));
vi.mock('@/components/ui/ConfirmSheet', () => ({
  ConfirmSheet: ({
    visible,
    body,
    confirmLabel,
    cancelLabel,
    destructive,
    onConfirm,
    onClose,
  }: {
    visible: boolean;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
    destructive: boolean;
    onConfirm: () => void;
    onClose: () => void;
  }) =>
    visible ? (
      <div role="dialog" data-destructive={String(destructive)}>
        <p>{body}</p>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onClose}>{cancelLabel}</button>
      </div>
    ) : null,
}));

function setDownloads(overrides: Record<string, unknown> = {}) {
  downloads.current = {
    records: [],
    isHydrated: true,
    isSupported: true,
    states: {},
    download: downloads.download,
    remove: downloads.remove,
    cancel: downloads.cancel,
    ...overrides,
  };
}
const withState = (state: PodcastDownloadState) => ({
  states: { [id]: state },
});
const runningState = (progress: number): PodcastDownloadState => ({
  status: 'downloading',
  progress,
  title: 'Episode',
  thumbnailUrl: 'https://example.com/cover.jpg',
  durationSeconds: 60,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  downloads.download.mockClear();
  downloads.remove.mockClear();
  downloads.cancel.mockClear();
  setDownloads();
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
const button = () => container.querySelector('button')!;
const icon = () =>
  container.querySelector('[data-icon]')?.getAttribute('data-icon');
const click = (element: Element) =>
  act(async () =>
    element.dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
const buttonNamed = (name: string) =>
  [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === name,
  )!;

describe('EpisodeDownloadButton', () => {
  it('offers the download, saying what is saved, and starts it', async () => {
    await render(<EpisodeDownloadButton episode={downloadableEpisode} />);
    expect(button().getAttribute('aria-label')).toBe('podcast.downloadVideo');
    expect(button().dataset['hint']).toBe('podcast.downloadHint');
    expect(button().dataset['tone']).toBe('default');
    expect(button().disabled).toBe(false);
    expect(icon()).toBe('Download');
    expect(container.querySelector('[data-ring]')).toBeNull();
    await click(button());
    expect(downloads.download).toHaveBeenCalledWith(downloadableEpisode);
  });

  it('draws a progress ring and cancels while downloading', async () => {
    setDownloads(withState(runningState(0.419)));
    await render(<EpisodeDownloadButton episode={downloadableEpisode} />);
    expect(button().getAttribute('aria-label')).toBe(
      'podcast.downloadCancel|{"percent":41}',
    );
    expect(button().dataset['busy']).toBe('true');
    expect(
      container.querySelector('[data-ring]')?.getAttribute('data-ring'),
    ).toBe('41');
    expect(icon()).toBe('X');
    await click(button());
    expect(downloads.cancel).toHaveBeenCalledWith(id);
    expect(downloads.download).not.toHaveBeenCalled();
  });

  it('shows a saved video as done, and removes it only after confirming', async () => {
    setDownloads({
      records: [downloadRecord({ byteSize: MB_69 })],
      states: {},
    });
    await render(<EpisodeDownloadButton episode={downloadableEpisode} />);
    expect(button().getAttribute('aria-label')).toBe('podcast.downloadRemove');
    expect(button().dataset['tone']).toBe('default');
    expect(icon()).toBe('Check');
    expect(container.querySelector('[data-ring]')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await click(button());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('data-destructive')).toBe('true');
    expect(dialog.textContent).toContain(
      'podcast.downloadRemoveMessage|{"size":"69 MB"}',
    );
    expect(downloads.remove).not.toHaveBeenCalled();

    // Backing out keeps the video.
    await click(buttonNamed('common.cancel'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(downloads.remove).not.toHaveBeenCalled();

    // Confirming removes it.
    await click(button());
    await click(buttonNamed('podcast.downloadRemoveConfirm'));
    expect(downloads.remove).toHaveBeenCalledWith(id);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('removes the video the sheet was opened for, even if the screen moves on', async () => {
    const first = { ...downloadableEpisode, localizationId: 'first' };
    const next = { ...downloadableEpisode, localizationId: 'next' };
    setDownloads({
      records: [downloadRecord({ localizationId: 'first', byteSize: MB_69 })],
    });
    await render(<EpisodeDownloadButton episode={first} />);
    await click(button());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    // Playback advances to another episode while the sheet is still open.
    await render(<EpisodeDownloadButton episode={next} />);
    await click(buttonNamed('podcast.downloadRemoveConfirm'));
    expect(downloads.remove).toHaveBeenCalledExactlyOnceWith('first');
  });

  it('marks a failed download for retry', async () => {
    setDownloads(withState({ status: 'failed', message: 'No space' }));
    await render(<EpisodeDownloadButton episode={downloadableEpisode} />);
    expect(button().getAttribute('aria-label')).toBe('podcast.downloadRetry');
    expect(button().dataset['tone']).toBe('alert');
    expect(icon()).toBe('RefreshCw');
    expect(container.querySelector('[data-ring]')).toBeNull();
    await click(button());
    expect(downloads.download).toHaveBeenCalledWith(downloadableEpisode);
  });

  it.each([
    [
      'an episode with no video',
      {},
      { ...downloadableEpisode, video: null },
      'podcast.downloadNoVideo',
    ],
    [
      'a platform that cannot download',
      { isSupported: false },
      downloadableEpisode,
      'podcast.downloadUnsupported',
    ],
    [
      'a manifest still loading',
      { isHydrated: false },
      downloadableEpisode,
      'podcast.downloadVideo',
    ],
  ])('is disabled and inert for %s', async (_name, context, episode, label) => {
    setDownloads(context);
    await render(<EpisodeDownloadButton episode={episode} />);
    if ('isSupported' in context && context.isSupported === false) {
      expect(container.innerHTML).toBe('');
      return;
    }
    expect(button().getAttribute('aria-label')).toBe(label);
    expect(button().disabled).toBe(true);
    await click(button());
    expect(downloads.download).not.toHaveBeenCalled();
  });
});

describe('EpisodeDownloadStatus', () => {
  it('stays silent while the video simply waits to be downloaded', async () => {
    await render(<EpisodeDownloadStatus episode={downloadableEpisode} />);
    expect(container.textContent).toBe('');
  });

  it('reports running progress', async () => {
    setDownloads(withState(runningState(0.419)));
    await render(<EpisodeDownloadStatus episode={downloadableEpisode} />);
    expect(container.textContent).toContain(
      'podcast.downloadStatusDownloading|{"percent":41}',
    );
    expect(icon()).toBe('Download');
  });

  it('reports a saved video with its size', async () => {
    setDownloads({ records: [downloadRecord({ byteSize: MB_69 })] });
    await render(<EpisodeDownloadStatus episode={downloadableEpisode} />);
    expect(container.textContent).toContain(
      'podcast.downloadStatusSaved|{"size":"69 MB"}',
    );
    expect(icon()).toBe('Check');
  });

  it('keeps the reason visible when a removal failed and the video is still saved', async () => {
    setDownloads({
      records: [downloadRecord({ byteSize: MB_69 })],
      ...withState({ status: 'failed', message: 'Unable to remove download.' }),
    });
    await render(<EpisodeDownloadStatus episode={downloadableEpisode} />);
    expect(container.textContent).toContain(
      'podcast.downloadStatusSaved|{"size":"69 MB"}',
    );
    expect(container.textContent).toContain('Unable to remove download.');
  });

  it('explains a failure with the reason', async () => {
    setDownloads(
      withState({ status: 'failed', message: 'Not enough device storage.' }),
    );
    await render(<EpisodeDownloadStatus episode={downloadableEpisode} />);
    expect(container.textContent).toContain('podcast.downloadStatusFailed');
    expect(container.textContent).toContain('Not enough device storage.');
    expect(icon()).toBe('TriangleAlert');
  });

  it.each([
    [{}, { ...downloadableEpisode, video: null }, 'podcast.downloadNoVideo'],
    [
      { isSupported: false },
      downloadableEpisode,
      'podcast.downloadUnsupported',
    ],
  ])('says why a download is impossible', async (context, episode, text) => {
    setDownloads(context);
    await render(<EpisodeDownloadStatus episode={episode} />);
    if ('isSupported' in context && context.isSupported === false) {
      expect(container.innerHTML).toBe('');
      return;
    }
    expect(container.textContent).toContain(text);
    expect(icon()).toBe('Info');
  });
});

vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <svg>{children}</svg>
  ),
  Circle: () => <circle />,
  Path: () => <path />,
  Rect: () => <rect />,
  Defs: ({ children }: { children?: React.ReactNode }) => (
    <defs>{children}</defs>
  ),
  ClipPath: ({ children }: { children?: React.ReactNode }) => (
    <clipPath>{children}</clipPath>
  ),
}));
