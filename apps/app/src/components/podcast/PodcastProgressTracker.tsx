import { useEffect, useRef } from 'react';

import { PODCAST_IN_PROGRESS_MIN_SECONDS } from '@/integration/podcastProgress';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';

/** Seconds from the end at which an episode is finalized as "listened". */
const COMPLETION_THRESHOLD_SECONDS = 2;
/** Persist the resume position at most once per this many seconds of playback. */
const POSITION_PERSIST_INTERVAL_SECONDS = 10;

/**
 * Bridges the shared podcast player to the device-local progress store: throttles
 * resume-position writes, finalizes an episode as listened near the end, and
 * resumes in-progress episodes from their saved position. Renders nothing.
 */
export function PodcastProgressTracker(): null {
  const player = usePodcastPlayer();
  const { progress, markListened, setPosition } = useEpisodeProgress();

  const nowPlaying = player.nowPlaying;
  const currentTime = player.currentTime;
  const duration = player.duration;

  const lastPersistedRef = useRef<{ id: string; seconds: number } | null>(null);
  const finalizedRef = useRef<Set<string>>(new Set());
  const resumedRef = useRef<string | null>(null);

  useEffect(() => {
    if (nowPlaying === null) return;
    const localizationId = nowPlaying.localizationId;
    const seconds = Math.floor(currentTime);

    const last = lastPersistedRef.current;
    const shouldPersist =
      last === null ||
      last.id !== localizationId ||
      Math.abs(seconds - last.seconds) >= POSITION_PERSIST_INTERVAL_SECONDS;
    if (shouldPersist && seconds > 0) {
      lastPersistedRef.current = { id: localizationId, seconds };
      setPosition(localizationId, seconds);
    }

    if (
      duration > 0 &&
      duration - currentTime <= COMPLETION_THRESHOLD_SECONDS &&
      !finalizedRef.current.has(localizationId)
    ) {
      finalizedRef.current.add(localizationId);
      markListened(localizationId, true);
    }
  }, [nowPlaying, currentTime, duration, markListened, setPosition]);

  // Resume an in-progress episode from its saved position once its duration is
  // known and playback is still near the start.
  useEffect(() => {
    if (nowPlaying === null) return;
    const localizationId = nowPlaying.localizationId;
    if (resumedRef.current === localizationId) return;

    const saved = progress[localizationId];
    if (
      saved !== undefined &&
      !saved.listened &&
      saved.lastPositionSeconds > PODCAST_IN_PROGRESS_MIN_SECONDS &&
      duration > 0 &&
      currentTime < COMPLETION_THRESHOLD_SECONDS
    ) {
      resumedRef.current = localizationId;
      player.seek(saved.lastPositionSeconds);
    }
  }, [nowPlaying, duration, currentTime, progress, player]);

  return null;
}
