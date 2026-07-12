import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import { usePodcastPlayer as usePodcastPlayerModel } from '@/integration/podcastPlayer';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { useAuthenticatedAction } from '@/providers/AuthenticatedActionProvider';

const PodcastPlayerContext = createContext<PodcastPlayer | null>(null);

export function PodcastPlayerProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const player = usePodcastPlayerModel();
  const authAction = useAuthenticatedAction();
  const toggle = useCallback<PodcastPlayer['toggle']>(
    (episode) => authAction.run(() => player.toggle(episode)),
    [authAction, player],
  );
  const playFromQueue = useCallback<PodcastPlayer['playFromQueue']>(
    (episodes, episode) =>
      authAction.run(() => player.playFromQueue(episodes, episode)),
    [authAction, player],
  );
  const gatedPlayer = useMemo(
    () => ({ ...player, toggle, playFromQueue }),
    [player, playFromQueue, toggle],
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
