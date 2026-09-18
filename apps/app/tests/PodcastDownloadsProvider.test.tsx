// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PodcastDownloadsProvider,
  usePodcastDownloads,
} from '@/providers/PodcastDownloadsProvider';
import type { PodcastMediaFiles } from '@/downloads/podcastMediaFiles.types';
import webFiles from '@/downloads/podcastMediaFiles.web';
import { downloadableEpisode, downloadRecord } from './support/podcastDownload';
import type { PodcastVideoDownloadRecord } from '@/integration/podcastVideoDownloads';

let root: Root;
let container: HTMLDivElement;
let context: ReturnType<typeof usePodcastDownloads>;
let disk: Set<string>;
let files: PodcastMediaFiles;
let stored: PodcastVideoDownloadRecord[];
let storage: {
  load: ReturnType<typeof vi.fn<() => Promise<PodcastVideoDownloadRecord[]>>>;
  save: ReturnType<
    typeof vi.fn<
      (records: readonly PodcastVideoDownloadRecord[]) => Promise<void>
    >
  >;
};
function Capture() {
  const value = usePodcastDownloads();
  useEffect(() => {
    context = value;
  }, [value]);
  return null;
}
async function mount() {
  await act(async () => {
    root.render(
      <PodcastDownloadsProvider files={files} storage={storage}>
        <Capture />
      </PodcastDownloadsProvider>,
    );
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  disk = new Set();
  stored = [];
  storage = {
    load: vi.fn(async () => stored),
    save: vi.fn(async (records) => {
      stored = [...records];
    }),
  };
  files = {
    isSupported: true,
    ensureDirectory: vi.fn(async () => undefined),
    availableBytes: vi.fn(async () => 1e9),
    localUri: (name) => `file:///documents/${name}`,
    remove: vi.fn(async (name) => {
      disk.delete(name);
    }),
    download: vi.fn(async (_url, name, { onProgress }) => {
      disk.add(name);
      onProgress(0.5);
      return 100;
    }),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(null, { headers: { 'content-length': '100' } }),
    ),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('PodcastDownloadsProvider', () => {
  it('downloads with the React Native AbortSignal surface, without throwIfAborted', async () => {
    const StandardController = AbortController;
    vi.stubGlobal(
      'AbortController',
      class extends StandardController {
        constructor() {
          super();
          Object.defineProperty(this.signal, 'throwIfAborted', {
            value: undefined,
          });
        }
      },
    );
    await mount();
    await act(async () => context.download(downloadableEpisode));
    expect(context.states[downloadableEpisode.localizationId]?.status).toBe(
      'downloaded',
    );
    expect(stored).toHaveLength(1);
  });
  it('commits both files and a durable record, then removes all three', async () => {
    await mount();
    await act(async () => context.download(downloadableEpisode));
    expect(context.states[downloadableEpisode.localizationId]).toEqual({
      status: 'downloaded',
    });
    expect(stored[0]).toMatchObject({
      localizationId: downloadableEpisode.localizationId,
      byteSize: 200,
    });
    expect(disk.size).toBe(2);
    expect(context.records).toEqual(stored);
    await act(async () => context.remove(downloadableEpisode.localizationId));
    expect(disk.size).toBe(0);
    expect(stored).toEqual([]);
    expect(context.records).toEqual([]);
  });
  it.each(['video', 'thumbnail', 'manifest', 'short file'])(
    'rolls back after %s failure',
    async (stage) => {
      vi.mocked(files.download).mockImplementation(async (url, name) => {
        disk.add(name);
        if (url.includes(stage)) throw new Error('transfer failed');
        return stage === 'short file' ? 1 : 100;
      });
      if (stage === 'manifest')
        storage.save.mockRejectedValue(new Error('storage full'));
      await mount();
      await act(async () => context.download(downloadableEpisode));
      expect(context.records).toEqual([]);
      expect(stored).toEqual([]);
      expect(disk.size).toBe(0);
      expect(context.states[downloadableEpisode.localizationId]?.status).toBe(
        'failed',
      );
      if (stage !== 'manifest') expect(storage.save).not.toHaveBeenCalled();
    },
  );
  it('queues changes during hydration and retains unrelated stored entries', async () => {
    let finish!: (records: PodcastVideoDownloadRecord[]) => void;
    storage.load.mockReturnValue(
      new Promise<PodcastVideoDownloadRecord[]>((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    expect(context.isHydrated).toBe(false);
    let pending!: Promise<void>;
    await act(async () => {
      pending = context.download(downloadableEpisode);
    });
    expect(files.download).not.toHaveBeenCalled();
    await act(async () => {
      finish([downloadRecord({ localizationId: 'other' })]);
      await pending;
    });
    expect(stored.map((record) => record.localizationId)).toEqual([
      'other',
      downloadableEpisode.localizationId,
    ]);
  });
  it('applies removal requested during hydration to the loaded manifest', async () => {
    let finish!: (records: PodcastVideoDownloadRecord[]) => void;
    storage.load.mockReturnValue(
      new Promise<PodcastVideoDownloadRecord[]>((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    let pending!: Promise<void>;
    await act(async () => {
      pending = context.remove(downloadableEpisode.localizationId);
    });
    await act(async () => {
      finish([downloadRecord(), downloadRecord({ localizationId: 'other' })]);
      await pending;
    });
    expect(context.records.map((record) => record.localizationId)).toEqual([
      'other',
    ]);
  });
  it('rejects insufficient space before downloading', async () => {
    vi.mocked(files.availableBytes).mockResolvedValue(1);
    await mount();
    await act(async () => context.download(downloadableEpisode));
    expect(files.download).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
    expect(context.states[downloadableEpisode.localizationId]).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('storage'),
    });
  });
  it('cancels an in-flight transfer and permits retry after cleanup', async () => {
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(files.download).mockImplementationOnce(
      async (_url, name, { signal }) => {
        disk.add(name);
        started();
        return new Promise<number>((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new Error('cancelled')),
            { once: true },
          ),
        );
      },
    );
    await mount();
    let pending!: Promise<void>;
    await act(async () => {
      pending = context.download(downloadableEpisode);
      await start;
    });
    await act(async () => {
      context.cancel(downloadableEpisode.localizationId);
      await pending;
    });
    expect(disk.size).toBe(0);
    expect(stored).toEqual([]);
    await act(async () => context.download(downloadableEpisode));
    expect(stored).toHaveLength(1);
  });
  it('deduplicates concurrent requests and preserves an existing download', async () => {
    await mount();
    await act(async () =>
      Promise.all([
        context.download(downloadableEpisode),
        context.download(downloadableEpisode),
      ]),
    );
    await act(async () => context.download(downloadableEpisode));
    expect(files.download).toHaveBeenCalledTimes(2);
    expect(stored).toHaveLength(1);
  });
  it('does not overwrite the manifest when hydration fails', async () => {
    storage.load.mockRejectedValue(new Error('read failed'));
    await mount();
    await act(async () => context.download(downloadableEpisode));
    expect(storage.save).not.toHaveBeenCalled();
    expect(files.download).not.toHaveBeenCalled();
    expect(context.states[downloadableEpisode.localizationId]?.status).toBe(
      'failed',
    );
  });
  it('reports unsupported on web and rejects adapter operations', async () => {
    files = webFiles;
    await mount();
    await act(async () => context.download(downloadableEpisode));
    expect(context.isSupported).toBe(false);
    expect(storage.save).not.toHaveBeenCalled();
    await expect(files.ensureDirectory()).rejects.toThrow('iOS');
    await expect(files.availableBytes()).rejects.toThrow('iOS');
    await expect(files.remove('test')).rejects.toThrow('iOS');
    await expect(
      files.download('url', 'test', {
        onProgress: () => undefined,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('iOS');
    expect(() => files.localUri('test')).toThrow('iOS');
  });
  it('reports missing video without starting network I/O', async () => {
    await mount();
    await act(async () =>
      context.download({ ...downloadableEpisode, video: null }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(context.states[downloadableEpisode.localizationId]).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('no downloadable video'),
    });
  });
});
