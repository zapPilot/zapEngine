export type PauseVideo = () => void;

export interface VideoPlaybackCoordinatorModel {
  pauseActiveVideo(): void;
  registerVideo(pause: PauseVideo): () => void;
}

/**
 * Tracks the single active video's pause callback so audio and video never play
 * at the same time. Last registration wins; unregistering only clears the slot
 * when it still points at the caller, so a stale unmount cannot evict a newer
 * video that has already taken over.
 */
export function createVideoPlaybackCoordinatorModel(): VideoPlaybackCoordinatorModel {
  let activePause: PauseVideo | null = null;

  return {
    pauseActiveVideo() {
      activePause?.();
    },
    registerVideo(pause) {
      activePause = pause;
      return () => {
        if (activePause === pause) {
          activePause = null;
        }
      };
    },
  };
}
