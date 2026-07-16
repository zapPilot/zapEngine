import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';

import { usePodcastPlayer as usePodcastPlayerModel } from '@/integration/podcastPlayer';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { useAuthenticatedAction } from '@/providers/AuthenticatedActionProvider';
import { useVideoPlaybackCoordinator } from '@/providers/VideoPlaybackCoordinatorProvider';

const PodcastPlayerContext = createContext<PodcastPlayer | null>(null);

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
  const rawSkipToPreviousEpisode = player.skipToPreviousEpisode;
  const rawSkipToNextEpisode = player.skipToNextEpisode;

  useEffect(() => {
    if (isPlaying) pauseActiveVideo();
  }, [isPlaying, pauseActiveVideo]);

  const toggle = useCallback<PodcastPlayer['toggle']>(
    (episode) =>
      authAction.run(() => {
        const startsAudio =
          currentLocalizationId !== episode.localizationId || !isPlaying;
        if (startsAudio) pauseActiveVideo();
        rawToggle(episode);
      }),
    [authAction, currentLocalizationId, isPlaying, pauseActiveVideo, rawToggle],
  );
  const playFromQueue = useCallback<PodcastPlayer['playFromQueue']>(
    (episodes, episode) =>
      authAction.run(() => {
        const startsAudio =
          currentLocalizationId !== episode.localizationId || !isPlaying;
        if (startsAudio) pauseActiveVideo();
        rawPlayFromQueue(episodes, episode);
      }),
    [
      authAction,
      currentLocalizationId,
      isPlaying,
      pauseActiveVideo,
      rawPlayFromQueue,
    ],
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
  const gatedPlayer = useMemo(
    () => ({
      ...player,
      toggle,
      playFromQueue,
      skipToPreviousEpisode,
      skipToNextEpisode,
    }),
    [player, playFromQueue, skipToNextEpisode, skipToPreviousEpisode, toggle],
  );

  return (
    <PodcastPlayerContext.Provider value={gatedPlayer}>
      {children}
    </PodcastPlayerContext.Provider>
  );
}

export function usePodcastPlayer(): PodcastPlayer {
  const player = useContext(PodcastPlayerContext);
  if (player === null) {
    throw new Error(
      'usePodcastPlayer must be used within PodcastPlayerProvider',
    );
  }
  return player;
}
