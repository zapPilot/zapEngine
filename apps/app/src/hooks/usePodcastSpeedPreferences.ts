import { useCallback } from 'react';

import {
  DEFAULT_PODCAST_SPEED_PREFERENCES,
  speedForSection,
  type PodcastSectionKind,
  type PodcastSpeedPreferences,
  withSectionSpeed,
} from '@/integration/podcastSections';
import { useHydratedStore } from '@/hooks/useHydratedStore';
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

function reduceSpeedMutation(
  current: PodcastSpeedPreferences,
  mutation: PendingSpeedMutation,
): PodcastSpeedPreferences {
  return withSectionSpeed(current, mutation.section, mutation.speed);
}

/** Hydrates durable speed preferences without overwriting an early user edit. */
export function usePodcastSpeedPreferences(): PodcastSpeedPreferenceState {
  const { value: preferences, commit } = useHydratedStore(
    { ...DEFAULT_PODCAST_SPEED_PREFERENCES },
    loadPodcastSpeedPreferences,
    savePodcastSpeedPreferences,
    reduceSpeedMutation,
  );

  const setSpeedForSection = useCallback(
    (section: PodcastSectionKind, speed: number) => {
      const updated = commit({ section, speed });
      return speedForSection(updated, section);
    },
    [commit],
  );

  return { preferences, setSpeedForSection };
}
