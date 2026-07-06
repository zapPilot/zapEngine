import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react';

import { usePodcastPlayer as usePodcastPlayerModel } from '@/integration/podcastPlayer';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';

const PodcastPlayerContext = createContext<PodcastPlayer | null>(null);

export function PodcastPlayerProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const player = usePodcastPlayerModel();

  return (
    <PodcastPlayerContext.Provider value={player}>
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
