export type VideoWorkAttempt<T> =
  | { acquired: true; value: T }
  | { acquired: false };

export interface HeavyWorkCoordinator {
  runIngest<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  tryRunVideo<T>(work: () => Promise<T>): Promise<VideoWorkAttempt<T>>;
}

/**
 * Keeps ingest (LLM, TTS, audio HLS) and video work off the same CPU inside one
 * process. It no longer caps how many videos run: that belongs to the render
 * worker, which is the only place that can weigh a slot against the machine's
 * free memory (src/services/render-admission.ts). All this has to know is
 * whether *any* video is still running, so a waiting ingest does not start
 * beside one.
 */
export function createHeavyWorkCoordinator(): HeavyWorkCoordinator {
  let activeIngests = 0;
  let waitingIngests = 0;
  let activeVideos = 0;
  const videoIdleWaiters = new Set<() => void>();

  const waitForVideoIdle = (signal?: AbortSignal): Promise<void> => {
    signal?.throwIfAborted();
    if (activeVideos === 0) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        videoIdleWaiters.delete(finish);
        const reason: unknown = signal?.reason;
        reject(
          reason instanceof Error
            ? reason
            : new Error('Aborted while waiting for video idle', {
                cause: reason,
              }),
        );
      };
      signal?.addEventListener('abort', abort, { once: true });
      videoIdleWaiters.add(finish);
    });
  };

  return {
    async runIngest<T>(
      work: () => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      waitingIngests += 1;
      try {
        await waitForVideoIdle(signal);
      } finally {
        waitingIngests -= 1;
      }

      signal?.throwIfAborted();
      activeIngests += 1;
      try {
        return await work();
      } finally {
        activeIngests -= 1;
      }
    },

    async tryRunVideo<T>(work: () => Promise<T>): Promise<VideoWorkAttempt<T>> {
      if (activeIngests > 0 || waitingIngests > 0) {
        return { acquired: false };
      }

      activeVideos += 1;
      try {
        return { acquired: true, value: await work() };
      } finally {
        activeVideos -= 1;
        if (activeVideos === 0) {
          for (const resolve of videoIdleWaiters) resolve();
          videoIdleWaiters.clear();
        }
      }
    },
  };
}

export const heavyWorkCoordinator = createHeavyWorkCoordinator();
