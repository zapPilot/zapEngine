export interface ProcessShutdown {
  // A property, not a method, so callers can destructure it without tripping
  // @typescript-eslint/unbound-method.
  shutdown: (signal?: string) => Promise<void>;
}

/**
 * Installs SIGINT/SIGTERM handlers that run `teardown` exactly once.
 *
 * Both entry points need this: the API server (src/index.ts) and the render
 * worker (src/worker.ts) run as separate Fly process groups. The handlers
 * detach before the first await so a second signal cannot start a parallel
 * teardown and so the process is left with the listener count it started with.
 */
export function installProcessShutdown(
  teardown: (signal: string) => Promise<void>,
): ProcessShutdown {
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = (signal = 'shutdown'): Promise<void> => {
    shutdownPromise ??= (async () => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      await teardown(signal);
    })();
    return shutdownPromise;
  };
  const onSigint = () => {
    void shutdown('SIGINT');
  };
  const onSigterm = () => {
    void shutdown('SIGTERM');
  };

  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  return { shutdown };
}
