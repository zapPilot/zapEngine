import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  type PodcastEpisodeProgress,
  type PodcastProgressMap,
} from '@/integration/podcastProgress';
import type { PodcastSectionKind } from '@/integration/podcastSections';
import {
  loadPodcastProgress,
  savePodcastProgress,
} from '@/storage/podcastStorage';

export interface PodcastProgressContextValue {
  progress: PodcastProgressMap;
  isHydrated: boolean;
  markListened: (localizationId: string, listened: boolean) => void;
  setPosition: (
    localizationId: string,
    seconds: number,
    section?: PodcastSectionKind,
    classroomLanguage?: string,
  ) => void;
  markAllListened: (localizationIds: readonly string[]) => void;
}

type PodcastProgressMutation =
  | {
      type: 'markListened';
      localizationId: string;
      listened: boolean;
    }
  | {
      type: 'setPosition';
      localizationId: string;
      seconds: number;
      section: PodcastSectionKind;
      classroomLanguage?: string;
    }
  | {
      type: 'markAllListened';
      localizationIds: readonly string[];
    };

const EMPTY_ENTRY: PodcastEpisodeProgress = {
  listened: false,
  lastPositionSeconds: 0,
};

function applyProgressMutation(
  current: PodcastProgressMap,
  mutation: PodcastProgressMutation,
): PodcastProgressMap {
  if (mutation.type === 'markListened') {
    const existing = current[mutation.localizationId] ?? EMPTY_ENTRY;
    if (existing.listened === mutation.listened) return current;
    return {
      ...current,
      [mutation.localizationId]: {
        ...existing,
        listened: mutation.listened,
      },
    };
  }

  if (mutation.type === 'setPosition') {
    const existing = current[mutation.localizationId] ?? EMPTY_ENTRY;
    const classroomLanguage =
      mutation.section === 'classroom'
        ? (mutation.classroomLanguage ?? undefined)
        : undefined;
    if (
      existing.lastPositionSeconds === mutation.seconds &&
      (existing.lastPositionSection ?? 'main') === mutation.section &&
      (existing.lastPositionClassroomLanguage ?? undefined) ===
        classroomLanguage
    ) {
      return current;
    }
    // Built explicitly rather than spreading `existing`: a stale
    // `lastPositionClassroomLanguage` from a previous classroom-language
    // entry must not survive onto a main (or different-language) position.
    const nextEntry: PodcastEpisodeProgress = {
      listened: existing.listened,
      lastPositionSeconds: mutation.seconds,
      lastPositionSection: mutation.section,
    };
    if (classroomLanguage !== undefined) {
      nextEntry.lastPositionClassroomLanguage = classroomLanguage;
    }
    return {
      ...current,
      [mutation.localizationId]: nextEntry,
    };
  }

  const next: PodcastProgressMap = { ...current };
  let changed = false;
  for (const localizationId of mutation.localizationIds) {
    const existing = next[localizationId] ?? EMPTY_ENTRY;
    if (existing.listened) continue;
    next[localizationId] = { ...existing, listened: true };
    changed = true;
  }
  return changed ? next : current;
}

const PodcastProgressContext = createContext<PodcastProgressContextValue>({
  progress: {},
  isHydrated: false,
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
  const [progress, setProgress] = useState<PodcastProgressMap>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const progressRef = useRef<PodcastProgressMap>({});
  const hydratedRef = useRef(false);
  const pendingMutationsRef = useRef<PodcastProgressMutation[]>([]);

  useEffect(() => {
    let active = true;
    void loadPodcastProgress().then((stored) => {
      if (!active) return;

      const pending = pendingMutationsRef.current;
      pendingMutationsRef.current = [];
      const hydrated = pending.reduce(applyProgressMutation, stored);

      hydratedRef.current = true;
      progressRef.current = hydrated;
      setProgress(hydrated);
      setIsHydrated(true);
      if (pending.length > 0) {
        void savePodcastProgress(hydrated);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const commitMutation = useCallback((mutation: PodcastProgressMutation) => {
    if (!hydratedRef.current) {
      pendingMutationsRef.current.push(mutation);
    }

    const next = applyProgressMutation(progressRef.current, mutation);
    if (next === progressRef.current) return;

    progressRef.current = next;
    setProgress(next);
    if (hydratedRef.current) {
      void savePodcastProgress(next);
    }
  }, []);

  const markListened = useCallback(
    (localizationId: string, listened: boolean) => {
      commitMutation({ type: 'markListened', localizationId, listened });
    },
    [commitMutation],
  );

  const setPosition = useCallback(
    (
      localizationId: string,
      seconds: number,
      section: PodcastSectionKind = 'main',
      classroomLanguage?: string,
    ) => {
      commitMutation({
        type: 'setPosition',
        localizationId,
        seconds,
        section,
        ...(classroomLanguage !== undefined ? { classroomLanguage } : {}),
      });
    },
    [commitMutation],
  );

  const markAllListened = useCallback(
    (localizationIds: readonly string[]) => {
      commitMutation({ type: 'markAllListened', localizationIds });
    },
    [commitMutation],
  );

  const value = useMemo(
    () => ({
      progress,
      isHydrated,
      markListened,
      setPosition,
      markAllListened,
    }),
    [progress, isHydrated, markListened, setPosition, markAllListened],
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
