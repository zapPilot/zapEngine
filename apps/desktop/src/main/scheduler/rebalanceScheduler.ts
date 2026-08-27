import type { RebalanceProposal, SchedulerContext } from '../../shared/ipc';
import { captureDesktopException } from '../sentry';

export const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
export const MIN_INTERVAL_MS = 15 * 60 * 1000; // 15min floor
export const DEFAULT_DRIFT_THRESHOLD_PERCENT = 1;

/** Parses ZAP_REBALANCE_CHECK_INTERVAL_MS with a 15-minute floor. */
export function clampIntervalMs(raw: string | undefined): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_INTERVAL_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_INTERVAL_MS;
  }
  return Math.max(parsed, MIN_INTERVAL_MS);
}

/**
 * Reads current portfolio drift for a context. Returns undefined when no
 * actionable drift exists (or data is unavailable).
 */
export type DriftReader = (
  context: SchedulerContext,
) => Promise<{ driftPercent: number; strategyId?: string } | undefined>;

export interface SchedulerDeps {
  readDrift: DriftReader;
  /** Fires user-facing notification + renderer push. Never signs anything. */
  notify: (proposal: RebalanceProposal) => void;
  intervalMs: number;
  driftThresholdPercent?: number;
  now?: () => Date;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  log?: (message: string) => void;
  /** Defaults to the desktop Sentry capture helper; override in tests. */
  captureException?: typeof captureDesktopException;
}

export interface RebalanceScheduler {
  setContext: (context: SchedulerContext | undefined) => void;
  /** Exposed for tests and a manual “check now” entry point. */
  tick: () => Promise<void>;
  stop: () => void;
}

export function createRebalanceScheduler(
  deps: SchedulerDeps,
): RebalanceScheduler {
  const threshold =
    deps.driftThresholdPercent ?? DEFAULT_DRIFT_THRESHOLD_PERCENT;
  const now = deps.now ?? (() => new Date());
  const setIntervalFn = deps.setIntervalFn ?? setInterval;
  const clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
  const log = deps.log ?? (() => {});
  const captureException = deps.captureException ?? captureDesktopException;

  let context: SchedulerContext | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking = false;
  let consecutiveFailures = 0;

  async function tick(): Promise<void> {
    if (!context || ticking) {
      return;
    }
    ticking = true;
    try {
      const drift = await deps.readDrift(context);
      consecutiveFailures = 0;
      if (drift && Math.abs(drift.driftPercent) >= threshold) {
        const proposal: RebalanceProposal = {
          driftPercent: drift.driftPercent,
          generatedAt: now().toISOString(),
        };
        if (drift.strategyId !== undefined) {
          proposal.strategyId = drift.strategyId;
        }
        deps.notify(proposal);
      }
    } catch (error) {
      consecutiveFailures += 1;
      log(`rebalance tick failed: ${String(error)}`);
      // Only the first failure of a run is reported — an unattended interval
      // timer would otherwise spam an event per tick for as long as the
      // underlying outage lasts.
      if (consecutiveFailures === 1) {
        captureException(error, {
          component: 'scheduler',
          tags: { operation: 'rebalance-drift-check' },
          context: { consecutiveFailures },
          level: 'warning',
        });
      }
    } finally {
      ticking = false;
    }
  }

  function stop(): void {
    if (timer !== undefined) {
      clearIntervalFn(timer);
      timer = undefined;
    }
  }

  function setContext(next: SchedulerContext | undefined): void {
    context = next;
    if (!next) {
      stop();
      return;
    }
    if (timer === undefined) {
      timer = setIntervalFn(() => {
        void tick();
      }, deps.intervalMs);
      // First check shortly after login rather than waiting a full interval.
      void tick();
    }
  }

  return { setContext, tick, stop };
}
