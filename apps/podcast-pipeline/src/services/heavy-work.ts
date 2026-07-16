export interface HeavyWorkCoordinatorState {
  activeIngests: number;
  waitingIngests: number;
  videoActive: boolean;
}

export type VideoWorkAttempt<T> =
  | { acquired: true; value: T }
  | { acquired: false };

export interface HeavyWorkCoordinator {
  runIngest<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  tryRunVideo<T>(work: () => Promise<T>): Promise<VideoWorkAttempt<T>>;
  getState(): HeavyWorkCoordinatorState;
}

export function createHeavyWorkCoordinator(): HeavyWorkCoordinator {
  let activeIngests = 0;
  let waitingIngests = 0;
  let videoActive = false;
  const videoIdleWaiters = new Set<() => void>();

  const waitForVideoIdle = (signal?: AbortSignal): Promise<void> => {
    signal?.throwIfAborted();
    if (!videoActive) return Promise.resolve();

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
      if (videoActive || activeIngests > 0 || waitingIngests > 0) {
        return { acquired: false };
      }

      videoActive = true;
      try {
        return { acquired: true, value: await work() };
      } finally {
        videoActive = false;
        for (const resolve of videoIdleWaiters) resolve();
        videoIdleWaiters.clear();
      }
    },

    getState(): HeavyWorkCoordinatorState {
      return { activeIngests, waitingIngests, videoActive };
    },
  };
}

export const heavyWorkCoordinator = createHeavyWorkCoordinator();
