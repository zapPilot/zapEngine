import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import { usePodcastPlayer as usePodcastPlayerModel } from '@/integration/podcastPlayer';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type {
  PodcastPlayer,
  PodcastPlayerStatus,
} from '@/integration/podcastPlayerTypes';
import { trackEvent } from '@/observability/analytics';
import { useAuthenticatedAction } from '@/providers/AuthenticatedActionProvider';
import { useVideoPlaybackCoordinator } from '@/providers/VideoPlaybackCoordinatorProvider';

interface PodcastPlayerClock {
  currentTime: number;
  duration: number;
}

// Split so a clock-only subscriber (the now-playing bar) can re-render at
// playback tick rate without forcing every other `usePodcastPlayerStatus()`
// consumer through the same cascade.
const PodcastPlayerStatusContext = createContext<PodcastPlayerStatus | null>(
  null,
);
const PodcastPlayerClockContext = createContext<PodcastPlayerClock | null>(
  null,
);

export function PodcastPlayerProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const player = usePodcastPlayerModel();
  const authAction = useAuthenticatedAction();
  const { pauseActiveVideo } = useVideoPlaybackCoordinator();
  const currentLocalizationId = player.nowPlaying?.localizationId;
  const isPlaying = player.isPlaying;
  const rawToggle = player.toggle;
  const rawPlayFromQueue = player.playFromQueue;
  const rawPlayFromQueueAt = player.playFromQueueAt;
  const rawPlaySectionFromQueue = player.playSectionFromQueue;
  const rawSkipToPreviousEpisode = player.skipToPreviousEpisode;
  const rawSkipToNextEpisode = player.skipToNextEpisode;

  useEffect(() => {
    if (isPlaying) pauseActiveVideo();
  }, [isPlaying, pauseActiveVideo]);

  // One report per episode start, watched here rather than in the four play
  // entry points below — and latched so pausing and resuming the same
  // localization does not count twice.
  const episodeId = player.nowPlaying?.id;
  const languageCode = player.nowPlaying?.languageCode;
  const reportedLocalizationId = useRef<string | null>(null);
  useEffect(() => {
    if (!isPlaying || !currentLocalizationId) return;
    if (reportedLocalizationId.current === currentLocalizationId) return;
    reportedLocalizationId.current = currentLocalizationId;
    trackEvent('podcast_episode_played', {
      episode_id: episodeId ?? '',
      localization_id: currentLocalizationId,
      language_code: languageCode ?? '',
    });
  }, [currentLocalizationId, episodeId, isPlaying, languageCode]);

  const startAudio = useCallback(
    (episode: PodcastEpisode, run: () => void) =>
      authAction.run(() => {
        const startsAudio =
          currentLocalizationId !== episode.localizationId || !isPlaying;
        if (startsAudio) pauseActiveVideo();
        run();
      }),
    [authAction, currentLocalizationId, isPlaying, pauseActiveVideo],
  );
  const toggle = useCallback<PodcastPlayer['toggle']>(
    (episode) => startAudio(episode, () => rawToggle(episode)),
    [rawToggle, startAudio],
  );
  const playFromQueue = useCallback<PodcastPlayer['playFromQueue']>(
    (episodes, episode) =>
      startAudio(episode, () => rawPlayFromQueue(episodes, episode)),
    [rawPlayFromQueue, startAudio],
  );
  const playFromQueueAt = useCallback<PodcastPlayer['playFromQueueAt']>(
    (episodes, episode, seconds, shouldPlay = true) =>
      authAction.run(() => {
        pauseActiveVideo();
        rawPlayFromQueueAt(episodes, episode, seconds, shouldPlay);
      }),
    [authAction, pauseActiveVideo, rawPlayFromQueueAt],
  );
  const playSectionFromQueue = useCallback<
    PodcastPlayer['playSectionFromQueue']
  >(
    (episodes, episode, section, options) =>
      authAction.run(() => {
        pauseActiveVideo();
        rawPlaySectionFromQueue(episodes, episode, section, options);
      }),
    [authAction, pauseActiveVideo, rawPlaySectionFromQueue],
  );
  const skipToPreviousEpisode = useCallback<
    PodcastPlayer['skipToPreviousEpisode']
  >(() => {
    pauseActiveVideo();
    return rawSkipToPreviousEpisode();
  }, [pauseActiveVideo, rawSkipToPreviousEpisode]);
  const skipToNextEpisode = useCallback<
    PodcastPlayer['skipToNextEpisode']
  >(() => {
    pauseActiveVideo();
    return rawSkipToNextEpisode();
  }, [pauseActiveVideo, rawSkipToNextEpisode]);
  const {
    nowPlaying,
    speed,
    sections,
    currentSection,
    currentSectionLanguage,
    queue,
    queueIndex,
    hasPreviousEpisode,
    hasNextEpisode,
    pause,
    seek,
    seekRelative,
    skipToSection,
    setSpeed,
  } = player;

  const statusValue = useMemo<PodcastPlayerStatus>(
    () => ({
      nowPlaying,
      isPlaying,
      speed,
      sections,
      currentSection,
      currentSectionLanguage,
      queue,
      queueIndex,
      hasPreviousEpisode,
      hasNextEpisode,
      pause,
      toggle,
      playFromQueue,
      playFromQueueAt,
      playSectionFromQueue,
      seek,
      seekRelative,
      skipToPreviousEpisode,
      skipToNextEpisode,
      skipToSection,
      setSpeed,
    }),
    [
      nowPlaying,
      isPlaying,
      speed,
      sections,
      currentSection,
      currentSectionLanguage,
      queue,
      queueIndex,
      hasPreviousEpisode,
      hasNextEpisode,
      pause,
      toggle,
      playFromQueue,
      playFromQueueAt,
      playSectionFromQueue,
      seek,
      seekRelative,
      skipToPreviousEpisode,
      skipToNextEpisode,
      skipToSection,
      setSpeed,
    ],
  );

  const clockValue = useMemo<PodcastPlayerClock>(
    () => ({ currentTime: player.currentTime, duration: player.duration }),
    [player.currentTime, player.duration],
  );

  return (
    <PodcastPlayerStatusContext.Provider value={statusValue}>
      <PodcastPlayerClockContext.Provider value={clockValue}>
        {children}
      </PodcastPlayerClockContext.Provider>
    </PodcastPlayerStatusContext.Provider>
  );
}

export function usePodcastPlayerStatus(): PodcastPlayerStatus {
  const status = useContext(PodcastPlayerStatusContext);
  if (status === null) {
    throw new Error(
      'usePodcastPlayerStatus must be used within PodcastPlayerProvider',
    );
  }
  return status;
}

function usePodcastPlayerClock(): PodcastPlayerClock {
  const clock = useContext(PodcastPlayerClockContext);
  if (clock === null) {
    throw new Error(
      'usePodcastPlayerClock must be used within PodcastPlayerProvider',
    );
  }
  return clock;
}

/** Merges the status and clock contexts back into the full player shape. */
export function usePodcastPlayer(): PodcastPlayer {
  const status = usePodcastPlayerStatus();
  const clock = usePodcastPlayerClock();
  return useMemo<PodcastPlayer>(
    () => ({ ...status, ...clock }),
    [status, clock],
  );
}
