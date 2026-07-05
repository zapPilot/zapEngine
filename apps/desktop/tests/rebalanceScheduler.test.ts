import { describe, expect, it, vi } from 'vitest';

import {
  clampIntervalMs,
  createRebalanceScheduler,
  DEFAULT_INTERVAL_MS,
  MIN_INTERVAL_MS,
} from '../src/main/scheduler/rebalanceScheduler';
import type { RebalanceProposal } from '../src/shared/ipc';

const CONTEXT = {
  userId: 'user-1',
  walletAddress: '0x1111111111111111111111111111111111111111',
};

describe('clampIntervalMs', () => {
  it('defaults to 6h when unset or invalid', () => {
    expect(clampIntervalMs(undefined)).toBe(DEFAULT_INTERVAL_MS);
    expect(clampIntervalMs('')).toBe(DEFAULT_INTERVAL_MS);
    expect(clampIntervalMs('abc')).toBe(DEFAULT_INTERVAL_MS);
    expect(clampIntervalMs('-5')).toBe(DEFAULT_INTERVAL_MS);
    expect(clampIntervalMs('0')).toBe(DEFAULT_INTERVAL_MS);
  });

  it('clamps to the 15-minute floor', () => {
    expect(clampIntervalMs('1000')).toBe(MIN_INTERVAL_MS);
    expect(clampIntervalMs(String(MIN_INTERVAL_MS - 1))).toBe(MIN_INTERVAL_MS);
  });

  it('passes through valid intervals', () => {
    expect(clampIntervalMs(String(30 * 60 * 1000))).toBe(30 * 60 * 1000);
  });
});

function makeDeps(overrides?: {
  drift?: number;
  strategyId?: string;
  threshold?: number;
}) {
  const notifications: RebalanceProposal[] = [];
  const setIntervalFn = vi.fn<typeof setInterval>(
    () => 0 as unknown as ReturnType<typeof setInterval>,
  );
  const deps = {
    readDrift: vi.fn(async () => {
      if (overrides?.drift === undefined) {
        return undefined;
      }
      if (overrides.strategyId !== undefined) {
        return {
          driftPercent: overrides.drift,
          strategyId: overrides.strategyId,
        };
      }
      return { driftPercent: overrides.drift };
    }),
    notify: (proposal: RebalanceProposal) => {
      notifications.push(proposal);
    },
    intervalMs: MIN_INTERVAL_MS,
    driftThresholdPercent: overrides?.threshold,
    now: () => new Date('2026-07-04T00:00:00.000Z'),
    setIntervalFn,
    clearIntervalFn: vi.fn(),
  };
  return { deps, notifications };
}

describe('createRebalanceScheduler', () => {
  it('does nothing without a context', async () => {
    const { deps, notifications } = makeDeps({ drift: 50 });
    const scheduler = createRebalanceScheduler(deps);
    await scheduler.tick();
    expect(deps.readDrift).not.toHaveBeenCalled();
    expect(notifications).toHaveLength(0);
  });

  it('notifies when drift meets the threshold', async () => {
    const { deps, notifications } = makeDeps({ drift: 5, threshold: 5 });
    const scheduler = createRebalanceScheduler(deps);
    scheduler.setContext(CONTEXT);
    await scheduler.tick();
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0]).toEqual({
      driftPercent: 5,
      generatedAt: '2026-07-04T00:00:00.000Z',
    });
  });

  it('includes strategy id when drift source supplies one', async () => {
    const { deps, notifications } = makeDeps({
      drift: 5,
      strategyId: 'strategy-default',
      threshold: 1,
    });
    const scheduler = createRebalanceScheduler(deps);
    scheduler.setContext(CONTEXT);
    await scheduler.tick();
    expect(notifications[0]).toEqual({
      driftPercent: 5,
      generatedAt: '2026-07-04T00:00:00.000Z',
      strategyId: 'strategy-default',
    });
  });

  it('stays quiet below the threshold', async () => {
    const { deps, notifications } = makeDeps({ drift: 0.4, threshold: 1 });
    const scheduler = createRebalanceScheduler(deps);
    scheduler.setContext(CONTEXT);
    // setContext fires an initial tick; run one more explicit tick.
    await scheduler.tick();
    expect(notifications).toHaveLength(0);
  });

  it('treats undefined drift as no action', async () => {
    const { deps, notifications } = makeDeps({ drift: undefined });
    const scheduler = createRebalanceScheduler(deps);
    scheduler.setContext(CONTEXT);
    await scheduler.tick();
    expect(notifications).toHaveLength(0);
  });

  it('starts the timer once and stops it on logout', () => {
    const { deps } = makeDeps({ drift: 10 });
    const scheduler = createRebalanceScheduler(deps);
    scheduler.setContext(CONTEXT);
    scheduler.setContext(CONTEXT);
    expect(deps.setIntervalFn).toHaveBeenCalledTimes(1);
    expect(deps.setIntervalFn).toHaveBeenCalledWith(
      expect.any(Function),
      MIN_INTERVAL_MS,
    );
    scheduler.setContext(undefined);
    expect(deps.clearIntervalFn).toHaveBeenCalledTimes(1);
  });

  it('runs scheduled ticks through the interval callback', async () => {
    let intervalCallback: (() => void) | undefined;
    const { deps, notifications } = makeDeps({ drift: 10 });
    deps.setIntervalFn.mockImplementation((callback) => {
      intervalCallback = callback;
      return 0 as unknown as ReturnType<typeof setInterval>;
    });
    const scheduler = createRebalanceScheduler(deps);
    scheduler.setContext(CONTEXT);
    await Promise.resolve();

    const notificationCount = notifications.length;
    expect(intervalCallback).toBeDefined();
    intervalCallback?.();
    await Promise.resolve();

    expect(notifications).toHaveLength(notificationCount + 1);
  });

  it('survives readDrift failures', async () => {
    const log = vi.fn();
    const scheduler = createRebalanceScheduler({
      readDrift: vi.fn(async () => {
        throw new Error('network down');
      }),
      notify: vi.fn(),
      intervalMs: MIN_INTERVAL_MS,
      setIntervalFn: vi.fn(
        () => 0 as unknown as ReturnType<typeof setInterval>,
      ),
      clearIntervalFn: vi.fn(),
      log,
    });
    scheduler.setContext(CONTEXT);
    await scheduler.tick();
    expect(log).toHaveBeenCalled();
  });
});
