import { useCallback, useEffect, useRef, useState } from 'react';

import type { EpisodeSortDirection } from '@/components/podcast/episodeSorting';
import {
  loadPodcastSortDirection,
  savePodcastSortDirection,
} from '@/storage/podcastStorage';

export function useEpisodeSortDirection() {
  const [direction, setDirectionState] =
    useState<EpisodeSortDirection>('newest');
  const directionRef = useRef<EpisodeSortDirection>('newest');
  const pendingDirectionRef = useRef<EpisodeSortDirection | null>(null);

  useEffect(() => {
    let active = true;
    void loadPodcastSortDirection().then((stored) => {
      if (!active) return;
      if (pendingDirectionRef.current !== null) {
        return;
      }
      directionRef.current = stored;
      setDirectionState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setDirection = useCallback((next: EpisodeSortDirection) => {
    directionRef.current = next;
    pendingDirectionRef.current = next;
    setDirectionState(next);
    void savePodcastSortDirection(next);
  }, []);

  return { direction, setDirection };
}
