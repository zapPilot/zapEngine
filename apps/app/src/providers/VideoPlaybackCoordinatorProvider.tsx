import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useState,
} from 'react';

import {
  createVideoPlaybackCoordinatorModel,
  type VideoPlaybackCoordinatorModel,
} from '@/integration/videoPlaybackCoordinatorModel';

const VideoPlaybackCoordinatorContext =
  createContext<VideoPlaybackCoordinatorModel | null>(null);

export function VideoPlaybackCoordinatorProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  // The model holds the active-video slot and has a stable identity for the
  // provider's lifetime, so consumers never re-render because of this context.
  const [model] = useState(createVideoPlaybackCoordinatorModel);

  return (
    <VideoPlaybackCoordinatorContext.Provider value={model}>
      {children}
    </VideoPlaybackCoordinatorContext.Provider>
  );
}

export function useVideoPlaybackCoordinator(): VideoPlaybackCoordinatorModel {
  const coordinator = useContext(VideoPlaybackCoordinatorContext);
  if (coordinator === null) {
    throw new Error(
      'useVideoPlaybackCoordinator must be used within VideoPlaybackCoordinatorProvider',
    );
  }
  return coordinator;
}
