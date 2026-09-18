import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import mediaFiles from '@/downloads/podcastMediaFiles';
import type { PodcastMediaFiles } from '@/downloads/podcastMediaFiles.types';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import {
  mergeDownloadRecord,
  removeDownloadRecord,
  videoDownloadFileNames,
  type PodcastVideoDownloadRecord,
} from '@/integration/podcastVideoDownloads';
import downloadStorage from '@/storage/podcastDownloadStorage';

export type PodcastDownloadState =
  | { status: 'idle' | 'downloaded' }
  | { status: 'downloading'; progress: number }
  | { status: 'failed'; message: string };
interface DownloadsContextValue {
  records: readonly PodcastVideoDownloadRecord[];
  isHydrated: boolean;
  isSupported: boolean;
  states: Readonly<Record<string, PodcastDownloadState>>;
  download(episode: PodcastEpisode): Promise<void>;
  remove(localizationId: string): Promise<void>;
  cancel(localizationId: string): void;
  localUri(fileName: string): string;
}
const DownloadsContext = createContext<DownloadsContextValue>({
  records: [],
  isHydrated: false,
  isSupported: false,
  states: {},
  download: async () => undefined,
  remove: async () => undefined,
  cancel: () => undefined,
  localUri: mediaFiles.localUri,
});
const DISK_RESERVE_BYTES = 10 * 1024 * 1024;

async function remoteSize(url: string, signal: AbortSignal): Promise<number> {
  const response = await fetch(url, { method: 'HEAD', signal });
  const size = Number(response.headers.get('content-length'));
  if (!response.ok || !Number.isSafeInteger(size) || size <= 0) {
    throw new Error('Unable to check download size. Please try again.');
  }
  return size;
}

export function PodcastDownloadsProvider({
  children,
  files = mediaFiles,
  storage = downloadStorage,
}: {
  children: ReactNode;
  files?: PodcastMediaFiles;
  storage?: typeof downloadStorage;
}) {
  const [records, setRecords] = useState<PodcastVideoDownloadRecord[]>([]);
  const [isHydrated, setHydrated] = useState(false);
  const [states, setStates] = useState<Record<string, PodcastDownloadState>>(
    {},
  );
  const recordsRef = useRef<PodcastVideoDownloadRecord[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const controllers = useRef(new Map<string, AbortController>());
  const ready = useRef<Promise<void>>(Promise.resolve());
  const loadError = useRef<unknown>(null);

  useEffect(() => {
    let active = true;
    loadError.current = null;
    ready.current = storage
      .load()
      .then(async (stored) => {
        if (!active) return;
        if (files.isSupported)
          await files.ensureDirectory(
            stored.flatMap((record) => [
              record.videoFileName,
              record.thumbnailFileName,
            ]),
          );
        if (!active) return;
        recordsRef.current = stored;
        setRecords(stored);
        setHydrated(true);
      })
      .catch((error: unknown) => {
        loadError.current = error;
        if (active) setHydrated(true);
      });
    const activeControllers = controllers.current;
    return () => {
      active = false;
      for (const controller of activeControllers.values()) controller.abort();
    };
  }, [files, storage]);

  const setState = useCallback((id: string, state: PodcastDownloadState) => {
    setStates((current) => ({ ...current, [id]: state }));
  }, []);
  const enqueue = useCallback(
    (operation: () => Promise<void>): Promise<void> => {
      const pending = queue.current.then(async () => {
        await ready.current;
        if (loadError.current !== null)
          throw new Error(
            'Unable to load downloads. Restart the app to retry.',
          );
        await operation();
      });
      queue.current = pending.catch(() => undefined);
      return pending;
    },
    [],
  );
  const persist = useCallback(
    async (next: PodcastVideoDownloadRecord[]) => {
      await storage.save(next);
      recordsRef.current = next;
      setRecords(next);
    },
    [storage],
  );
  const cleanFiles = useCallback(
    async (id: string) => {
      const names = videoDownloadFileNames(id);
      const results = await Promise.allSettled([
        files.remove(names.video),
        files.remove(names.thumbnail),
      ]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    },
    [files],
  );

  const download = useCallback(
    async (episode: PodcastEpisode) => {
      const id = episode.localizationId;
      if (controllers.current.has(id)) return;
      if (!files.isSupported || episode.video === null) {
        setState(id, {
          status: 'failed',
          message: files.isSupported
            ? 'This episode has no downloadable video.'
            : 'Offline downloads require iOS or Android.',
        });
        return;
      }
      const video = episode.video;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      setState(id, { status: 'downloading', progress: 0 });
      try {
        await enqueue(async () => {
          if (recordsRef.current.some((record) => record.localizationId === id))
            return;
          const { signal } = controller;
          if (signal.aborted) throw new Error('Download cancelled.');
          const names = videoDownloadFileNames(id);
          try {
            const sizes = await Promise.all([
              remoteSize(video.url, signal),
              remoteSize(video.thumbnailUrl, signal),
            ]);
            if (
              (await files.availableBytes()) <
              sizes[0]! + sizes[1]! + DISK_RESERVE_BYTES
            )
              throw new Error(
                'Not enough device storage. Free up space and retry.',
              );
            await files.ensureDirectory();
            await cleanFiles(id);
            const videoBytes = await files.download(video.url, names.video, {
              signal,
              onProgress: (progress) =>
                setState(id, {
                  status: 'downloading',
                  progress: Math.min(0.99, Math.max(0, progress * 0.99)),
                }),
            });
            if (signal.aborted) throw new Error('Download cancelled.');
            const thumbnailBytes = await files.download(
              video.thumbnailUrl,
              names.thumbnail,
              { signal, onProgress: () => undefined },
            );
            if (signal.aborted) throw new Error('Download cancelled.');
            if (videoBytes !== sizes[0] || thumbnailBytes !== sizes[1])
              throw new Error('Download was incomplete. Please retry.');
            await persist(
              mergeDownloadRecord(recordsRef.current, {
                localizationId: id,
                episodeId: episode.id,
                title: episode.title,
                languageCode: episode.languageCode,
                createdAt: episode.createdAt,
                durationSeconds: video.durationSeconds,
                videoFileName: names.video,
                thumbnailFileName: names.thumbnail,
                byteSize: videoBytes + thumbnailBytes,
                downloadedAt: new Date().toISOString(),
              }),
            );
          } catch (error) {
            await cleanFiles(id);
            throw error;
          }
        });
        setState(id, { status: 'downloaded' });
      } catch (error) {
        setState(id, {
          status: 'failed',
          message: controller.signal.aborted
            ? 'Download cancelled. Tap to retry.'
            : error instanceof Error
              ? error.message
              : 'Download failed. Please retry.',
        });
      } finally {
        controllers.current.delete(id);
      }
    },
    [cleanFiles, enqueue, files, persist, setState],
  );
  const remove = useCallback(
    async (id: string) => {
      controllers.current.get(id)?.abort();
      try {
        await enqueue(async () => {
          // Remove the manifest first so a crash cannot advertise a deleted video.
          await persist(removeDownloadRecord(recordsRef.current, id));
          await cleanFiles(id);
        });
        setState(id, { status: 'idle' });
      } catch (error) {
        setState(id, {
          status: 'failed',
          message:
            error instanceof Error
              ? error.message
              : 'Unable to remove download.',
        });
      }
    },
    [cleanFiles, enqueue, persist, setState],
  );
  const cancel = useCallback(
    (id: string) => controllers.current.get(id)?.abort(),
    [],
  );
  const value = useMemo(
    () => ({
      records,
      isHydrated,
      isSupported: files.isSupported,
      states,
      download,
      remove,
      cancel,
      localUri: files.localUri,
    }),
    [records, isHydrated, files, states, download, remove, cancel],
  );
  return (
    <DownloadsContext.Provider value={value}>
      {children}
    </DownloadsContext.Provider>
  );
}
export function usePodcastDownloads() {
  return useContext(DownloadsContext);
}
