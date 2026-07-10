import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {
  type PodcastEpisodeProgress,
  PODCAST_PROGRESS_STORAGE_KEY,
  type PodcastProgressMap,
} from '@/integration/podcastProgress';

interface PodcastProgressContextValue {
  progress: PodcastProgressMap;
  markListened: (localizationId: string, listened: boolean) => void;
  setPosition: (localizationId: string, seconds: number) => void;
  markAllListened: (localizationIds: readonly string[]) => void;
}

const EMPTY_ENTRY: PodcastEpisodeProgress = {
  listened: false,
  lastPositionSeconds: 0,
};

function readStoredProgress(): PodcastProgressMap {
  try {
    const raw = globalThis.localStorage?.getItem(PODCAST_PROGRESS_STORAGE_KEY);
    if (raw == null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return {};
    return parsed as PodcastProgressMap;
  } catch {
    // Web storage is unavailable (native runtime) or the value is corrupt.
    return {};
  }
}

function persistProgress(map: PodcastProgressMap): void {
  try {
    globalThis.localStorage?.setItem(
      PODCAST_PROGRESS_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    // Best effort: the in-memory map still applies for this session.
  }
}

const PodcastProgressContext = createContext<PodcastProgressContextValue>({
  progress: {},
  markListened: () => undefined,
  setPosition: () => undefined,
  markAllListened: () => undefined,
});

/** Persists per-localization podcast listening progress on the device. */
export function PodcastProgressProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [progress, setProgress] =
    useState<PodcastProgressMap>(readStoredProgress);

  const markListened = useCallback(
    (localizationId: string, listened: boolean) => {
      setProgress((current) => {
        const existing = current[localizationId] ?? EMPTY_ENTRY;
        if (existing.listened === listened) return current;
        const next: PodcastProgressMap = {
          ...current,
          [localizationId]: { ...existing, listened },
        };
        persistProgress(next);
        return next;
      });
    },
    [],
  );

  const setPosition = useCallback((localizationId: string, seconds: number) => {
    setProgress((current) => {
      const existing = current[localizationId] ?? EMPTY_ENTRY;
      if (existing.lastPositionSeconds === seconds) return current;
      const next: PodcastProgressMap = {
        ...current,
        [localizationId]: { ...existing, lastPositionSeconds: seconds },
      };
      persistProgress(next);
      return next;
    });
  }, []);

  const markAllListened = useCallback((localizationIds: readonly string[]) => {
    setProgress((current) => {
      const next: PodcastProgressMap = { ...current };
      let changed = false;
      for (const localizationId of localizationIds) {
        const existing = next[localizationId];
        if (existing?.listened === true) continue;
        next[localizationId] = {
          listened: true,
          lastPositionSeconds: existing?.lastPositionSeconds ?? 0,
        };
        changed = true;
      }
      if (!changed) return current;
      persistProgress(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ progress, markListened, setPosition, markAllListened }),
    [progress, markListened, setPosition, markAllListened],
  );

  return (
    <PodcastProgressContext.Provider value={value}>
      {children}
    </PodcastProgressContext.Provider>
  );
}

export function useEpisodeProgress(): PodcastProgressContextValue {
  return useContext(PodcastProgressContext);
}
