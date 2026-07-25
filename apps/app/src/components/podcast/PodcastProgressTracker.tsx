import { useEffect, useRef } from 'react';

import { PODCAST_IN_PROGRESS_MIN_SECONDS } from '@/integration/podcastProgress';
import { nextPlaybackSection } from '@/integration/podcastSections';
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
  const sections = player.sections;
  const currentSection = player.currentSection;

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
      setPosition(localizationId, seconds, currentSection);
    }

    // Only finalize as listened when the LAST section finishes. If main narration
    // ends but a classroom section is still pending, the episode stays unheard
    // and resumes into the classroom next time — so a missed background
    // transition delays the classroom, never silently skips it.
    const isLastSection =
      nextPlaybackSection(sections, currentSection) === null;
    if (
      isLastSection &&
      duration > 0 &&
      duration - currentTime <= COMPLETION_THRESHOLD_SECONDS &&
      !finalizedRef.current.has(localizationId)
    ) {
      finalizedRef.current.add(localizationId);
      markListened(localizationId, true);
    }
  }, [
    nowPlaying,
    currentTime,
    duration,
    sections,
    currentSection,
    markListened,
    setPosition,
  ]);

  // Resume an in-progress episode from its saved position once its duration is
  // known and playback is still near the start. A position saved in the
  // classroom section resumes into that section.
  useEffect(() => {
    if (nowPlaying === null) return;
    const localizationId = nowPlaying.localizationId;
    if (resumedRef.current === localizationId) return;

    const saved = progress[localizationId];
    if (
      saved === undefined ||
      saved.listened ||
      saved.lastPositionSeconds <= PODCAST_IN_PROGRESS_MIN_SECONDS ||
      duration <= 0 ||
      currentTime >= COMPLETION_THRESHOLD_SECONDS ||
      currentSection !== 'main'
    ) {
      return;
    }

    resumedRef.current = localizationId;
    const savedSection = saved.lastPositionSection ?? 'main';
    const hasClassroom = sections.some(
      (section) => section.kind === 'classroom',
    );
    if (savedSection === 'classroom') {
      // Only resume into the classroom when the episode still has that section;
      // a classroom-relative position must not be seeked on the main narration.
      if (hasClassroom) {
        player.skipToSection('classroom', saved.lastPositionSeconds);
      }
      return;
    }
    player.seek(saved.lastPositionSeconds);
  }, [
    nowPlaying,
    duration,
    currentTime,
    currentSection,
    sections,
    progress,
    player,
  ]);

  return null;
}
