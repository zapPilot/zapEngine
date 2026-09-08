export interface CreatePollingSweeperOptions {
  intervalMs: number;
  run: () => Promise<void>;
  onError?: (error: unknown) => void;
}

export interface PollingSweeper {
  start(): void;
  run(): Promise<void>;
  stop(): void;
}

/**
 * Shared lifecycle for this service's interval-driven polling loops: single-flight
 * (a call while one run is already in flight returns that same promise instead of
 * starting a second one), an immediate first run on `start()`, and an `unref`'d
 * `setInterval` so the loop never keeps the process alive on its own. `stop()` is
 * terminal — once stopped, `start()` is a permanent no-op, matching a worker/API
 * process shutdown rather than a pausable timer.
 *
 * `onError` decides what an unhandled rejection from `run` becomes: given, it is
 * called and the sweep completes normally; omitted, the rejection propagates, so a
 * caller that always catches its own errors (like the two Telegram sweepers) is
 * unaffected either way.
 */
export function createPollingSweeper(
  options: CreatePollingSweeperOptions,
): PollingSweeper {
  const { intervalMs, run: doRun, onError } = options;
  let timer: NodeJS.Timeout | null = null;
  let started = false;
  let stopped = false;
  let active: Promise<void> | null = null;

  const run = async (): Promise<void> => {
    if (stopped) return;
    if (active) return active;
    const work = (async (): Promise<void> => {
      try {
        await doRun();
      } catch (error) {
        if (!onError) throw error;
        onError(error);
      }
    })();
    active = work;
    try {
      await work;
    } finally {
      if (active === work) active = null;
    }
  };

  return {
    start(): void {
      if (started || stopped) return;
      started = true;
      void run();
      timer = setInterval(() => void run(), intervalMs);
      timer.unref();
    },
    run,
    stop(): void {
      stopped = true;
      started = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

export interface SweepNotifier {
  start(): void;
  sweep(): Promise<void>;
  stop(): void;
}

/**
 * The `start`/`sweep`/`stop` shape shared by this service's two Telegram
 * reap-and-notify sweepers (video completion, video visual failure): a thin
 * rename of `run` to the more descriptive `sweep`. `render-capacity.ts`'s
 * reconciler wires `createPollingSweeper` directly instead — it needs its own
 * `runOnce` naming, plus its own start/stop logging around the sweeper.
 */
export function createSweepNotifier(
  options: CreatePollingSweeperOptions,
): SweepNotifier {
  const sweeper = createPollingSweeper(options);
  return {
    start: () => sweeper.start(),
    sweep: () => sweeper.run(),
    stop: () => sweeper.stop(),
  };
}
