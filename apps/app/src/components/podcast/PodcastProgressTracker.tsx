import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { PODCAST_IN_PROGRESS_MIN_SECONDS } from '@/integration/podcastProgress';
import {
  nextPlaybackSection,
  type PodcastSectionKind,
} from '@/integration/podcastSections';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';

/** Seconds from the end at which an episode is finalized as "listened". */
const COMPLETION_THRESHOLD_SECONDS = 2;
/** Persist the resume position at most once per this many seconds of playback. */
const POSITION_PERSIST_INTERVAL_SECONDS = 10;

interface PlaybackSnapshot {
  localizationId: string;
  currentTime: number;
  currentSection: PodcastSectionKind;
  isPlaying: boolean;
}

/**
 * Bridges the shared podcast player to the device-local progress store: throttles
 * resume-position writes, finalizes an episode as listened near the end, and
 * resumes in-progress episodes from their saved position. Renders nothing.
 */
export function PodcastProgressTracker(): null {
  const player = usePodcastPlayer();
  const { progress, isHydrated, markListened, setPosition } =
    useEpisodeProgress();

  const nowPlaying = player.nowPlaying;
  const currentTime = player.currentTime;
  const duration = player.duration;
  const sections = player.sections;
  const currentSection = player.currentSection;
  const isPlaying = player.isPlaying;

  const latestPlaybackRef = useRef<PlaybackSnapshot | null>(null);
  const lastPersistedRef = useRef<{
    id: string;
    section: PodcastSectionKind;
    seconds: number;
  } | null>(null);
  const finalizedRef = useRef<Set<string>>(new Set());
  const resumedRef = useRef<string | null>(null);

  const persistSnapshot = useCallback(
    (snapshot: PlaybackSnapshot, force: boolean) => {
      const seconds = Math.floor(snapshot.currentTime);
      if (seconds <= 0) return;

      const last = lastPersistedRef.current;
      const isSamePosition =
        last?.id === snapshot.localizationId &&
        last.section === snapshot.currentSection &&
        last.seconds === seconds;
      const intervalElapsed =
        last === null ||
        last.id !== snapshot.localizationId ||
        last.section !== snapshot.currentSection ||
        Math.abs(seconds - last.seconds) >= POSITION_PERSIST_INTERVAL_SECONDS;
      if (isSamePosition || (!force && !intervalElapsed)) return;

      lastPersistedRef.current = {
        id: snapshot.localizationId,
        section: snapshot.currentSection,
        seconds,
      };
      setPosition(snapshot.localizationId, seconds, snapshot.currentSection);
    },
    [setPosition],
  );

  useEffect(() => {
    const previous = latestPlaybackRef.current;
    const next: PlaybackSnapshot | null =
      nowPlaying === null
        ? null
        : {
            localizationId: nowPlaying.localizationId,
            currentTime,
            currentSection,
            isPlaying,
          };

    if (
      previous !== null &&
      (next === null ||
        previous.localizationId !== next.localizationId ||
        previous.currentSection !== next.currentSection)
    ) {
      persistSnapshot(previous, true);
    }
    if (
      previous?.isPlaying === true &&
      next !== null &&
      !next.isPlaying &&
      previous.localizationId === next.localizationId &&
      previous.currentSection === next.currentSection
    ) {
      persistSnapshot(next, true);
    }

    latestPlaybackRef.current = next;
    if (next !== null) {
      persistSnapshot(next, false);
    }

    if (nowPlaying === null) return;
    const localizationId = nowPlaying.localizationId;
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
    isPlaying,
    markListened,
    persistSnapshot,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') {
        const latest = latestPlaybackRef.current;
        if (latest !== null) persistSnapshot(latest, true);
      }
    });
    return () => subscription.remove();
  }, [persistSnapshot]);

  useEffect(
    () => () => {
      const latest = latestPlaybackRef.current;
      if (latest !== null) persistSnapshot(latest, true);
    },
    [persistSnapshot],
  );

  // Resume an in-progress episode from its saved position once its duration is
  // known and playback is still near the start. A position saved in the
  // classroom section resumes into that section.
  useEffect(() => {
    if (!isHydrated || nowPlaying === null) return;
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
    isHydrated,
    player,
  ]);

  return null;
}
