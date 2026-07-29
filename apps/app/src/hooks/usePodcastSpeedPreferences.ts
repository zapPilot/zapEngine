import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_PODCAST_SPEED_PREFERENCES,
  speedForSection,
  type PodcastSectionKind,
  type PodcastSpeedPreferences,
  withSectionSpeed,
} from '@/integration/podcastSections';
import {
  loadPodcastSpeedPreferences,
  savePodcastSpeedPreferences,
} from '@/storage/podcastStorage';

interface PodcastSpeedPreferenceState {
  preferences: PodcastSpeedPreferences;
  setSpeedForSection: (section: PodcastSectionKind, speed: number) => number;
}

interface PendingSpeedMutation {
  section: PodcastSectionKind;
  speed: number;
}

/** Hydrates durable speed preferences without overwriting an early user edit. */
export function usePodcastSpeedPreferences(): PodcastSpeedPreferenceState {
  const [preferences, setPreferences] = useState<PodcastSpeedPreferences>({
    ...DEFAULT_PODCAST_SPEED_PREFERENCES,
  });
  const preferencesRef = useRef(preferences);
  const hydratedRef = useRef(false);
  const pendingMutationsRef = useRef<PendingSpeedMutation[]>([]);

  useEffect(() => {
    let active = true;
    void loadPodcastSpeedPreferences().then((stored) => {
      if (!active) return;

      const pending = pendingMutationsRef.current;
      pendingMutationsRef.current = [];
      const hydrated = pending.reduce(
        (current, mutation) =>
          withSectionSpeed(current, mutation.section, mutation.speed),
        stored,
      );

      hydratedRef.current = true;
      preferencesRef.current = hydrated;
      setPreferences(hydrated);
      if (pending.length > 0) {
        void savePodcastSpeedPreferences(hydrated);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setSpeedForSection = useCallback(
    (section: PodcastSectionKind, speed: number) => {
      if (!hydratedRef.current) {
        pendingMutationsRef.current.push({ section, speed });
      }
      const updated = withSectionSpeed(preferencesRef.current, section, speed);
      preferencesRef.current = updated;
      setPreferences(updated);
      if (hydratedRef.current) {
        void savePodcastSpeedPreferences(updated);
      }
      return speedForSection(updated, section);
    },
    [],
  );

  return { preferences, setSpeedForSection };
}
