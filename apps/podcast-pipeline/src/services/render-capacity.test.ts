import { describe, expect, it, vi } from 'vitest';

import type { FlyMachinesClient, FlyMachineSummary } from './fly-machines.js';
import {
  createRenderCapacityReconciler,
  createRenderWorkProbe,
  evaluatePendingRenderWork,
  RENDER_CAPACITY_MAX_API_FAILURES,
  RENDER_CAPACITY_MAX_REPEATED_WAKES,
  type RenderWorkSnapshot,
  type VideoWorkRow,
  type VisualWorkRow,
} from './render-capacity.js';
import { EPISODE_VIDEO_VISUAL_VERSION } from './video-jobs.js';

const NOW = Date.parse('2026-07-30T12:00:00.000Z');
const PAST = new Date(NOW - 60_000).toISOString();
const FUTURE = new Date(NOW + 60_000).toISOString();

function visualRow(overrides: Partial<VisualWorkRow> = {}): VisualWorkRow {
  return {
    episode_id: 'episode-1',
    status: 'queued',
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    visual_hash: null,
    next_attempt_at: PAST,
    attempt_count: 0,
    lease_expires_at: null,
    telegram_chat_id: null,
    ...overrides,
  };
}

function completedVisualRow(
  overrides: Partial<VisualWorkRow> = {},
): VisualWorkRow {
  return visualRow({
    status: 'completed',
    visual_hash: 'visual-hash',
    ...overrides,
  });
}

function videoRow(overrides: Partial<VideoWorkRow> = {}): VideoWorkRow {
  return {
    episode_localization_id: 'localization-1',
    episode_id: 'episode-1',
    status: 'queued',
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    visual_hash: 'visual-hash',
    next_attempt_at: PAST,
    attempt_count: 0,
    lease_expires_at: null,
    telegram_chat_id: null,
    failure_notified_at: null,
    ...overrides,
  };
}

function snapshot(partial: Partial<RenderWorkSnapshot>): RenderWorkSnapshot {
  return { visuals: [], videos: [], nowMs: NOW, ...partial };
}

describe('evaluatePendingRenderWork', () => {
  it('reports no work for an empty queue', () => {
    expect(evaluatePendingRenderWork(snapshot({}))).toBeNull();
  });

  it('reports a claimable visual job', () => {
    const pending = evaluatePendingRenderWork(
      snapshot({ visuals: [visualRow({ telegram_chat_id: '42' })] }),
    );

    expect(pending).toEqual({
      reasons: ['visual:queued:episode-1'],
      telegramChatId: '42',
    });
  });

  it.each([
    ['a stale visual_version', visualRow({ visual_version: 'v1-legacy' })],
    ['a backoff still in the future', visualRow({ next_attempt_at: FUTURE })],
    ['an exhausted attempt budget', visualRow({ attempt_count: 3 })],
    ['an unparseable next_attempt_at', visualRow({ next_attempt_at: 'nope' })],
  ])('ignores a queued visual job with %s', (_label, visual) => {
    expect(
      evaluatePendingRenderWork(snapshot({ visuals: [visual] })),
    ).toBeNull();
  });

  it('reports a visual job orphaned by an expired lease', () => {
    const pending = evaluatePendingRenderWork(
      snapshot({
        visuals: [visualRow({ status: 'processing', lease_expires_at: PAST })],
      }),
    );

    expect(pending?.reasons).toEqual(['visual:orphaned:episode-1']);
  });

  it('ignores a processing visual job whose lease is still live', () => {
    expect(
      evaluatePendingRenderWork(
        snapshot({
          visuals: [
            visualRow({ status: 'processing', lease_expires_at: FUTURE }),
          ],
        }),
      ),
    ).toBeNull();
  });

  it('reports a queued render job once its visual checkpoint is completed', () => {
    const pending = evaluatePendingRenderWork(
      snapshot({
        visuals: [completedVisualRow()],
        videos: [videoRow({ telegram_chat_id: '7' })],
      }),
    );

    expect(pending).toEqual({
      reasons: ['video:queued:localization-1'],
      telegramChatId: '7',
    });
  });

  it('does not wake for a queued render job whose visual is still processing', () => {
    // The claim RPC joins on a completed visual, so waking here would burn a
    // machine that immediately idles back out.
    expect(
      evaluatePendingRenderWork(
        snapshot({
          visuals: [
            visualRow({ status: 'processing', lease_expires_at: FUTURE }),
          ],
          videos: [videoRow()],
        }),
      ),
    ).toBeNull();
  });

  it.each([
    [
      'a visual hash that does not match',
      completedVisualRow({ visual_hash: 'other-hash' }),
      videoRow(),
    ],
    [
      'a visual version that does not match',
      completedVisualRow({ visual_version: 'v1-legacy' }),
      videoRow(),
    ],
    [
      'no visual hash on the render job',
      completedVisualRow(),
      videoRow({ visual_hash: null }),
    ],
    [
      'a stale visual_version on the render job',
      completedVisualRow({ visual_version: 'v1-legacy' }),
      videoRow({ visual_version: 'v1-legacy' }),
    ],
  ])(
    'does not wake for a queued render job with %s',
    (_label, visual, video) => {
      expect(
        evaluatePendingRenderWork(
          snapshot({ visuals: [visual], videos: [video] }),
        ),
      ).toBeNull();
    },
  );

  it('reports a render job orphaned by an expired lease even without a completed visual', () => {
    const pending = evaluatePendingRenderWork(
      snapshot({
        videos: [videoRow({ status: 'processing', lease_expires_at: PAST })],
      }),
    );

    expect(pending?.reasons).toEqual(['video:orphaned:localization-1']);
  });

  it('reports a failed render job whose Telegram notice was never delivered', () => {
    const pending = evaluatePendingRenderWork(
      snapshot({
        videos: [
          videoRow({
            status: 'failed',
            telegram_chat_id: '42',
            failure_notified_at: null,
          }),
        ],
      }),
    );

    expect(pending).toEqual({
      reasons: ['video:unnotified-failure:localization-1'],
      telegramChatId: '42',
    });
  });

  it.each([
    [
      'the notice was already delivered',
      videoRow({
        status: 'failed',
        telegram_chat_id: '42',
        failure_notified_at: '2026-07-30T11:00:00.000Z',
      }),
    ],
    ['there is no chat to notify', videoRow({ status: 'failed' })],
  ])('ignores a failed render job when %s', (_label, video) => {
    expect(evaluatePendingRenderWork(snapshot({ videos: [video] }))).toBeNull();
  });

  it('produces a stable fingerprint regardless of row order', () => {
    const rows = [
      videoRow({ episode_localization_id: 'localization-b' }),
      videoRow({ episode_localization_id: 'localization-a' }),
    ];
    const forward = evaluatePendingRenderWork(
      snapshot({ visuals: [completedVisualRow()], videos: rows }),
    );
    const reversed = evaluatePendingRenderWork(
      snapshot({
        visuals: [completedVisualRow()],
        videos: [...rows].reverse(),
      }),
    );

    expect(forward?.reasons).toEqual([
      'video:queued:localization-a',
      'video:queued:localization-b',
    ]);
    expect(reversed?.reasons).toEqual(forward?.reasons);
  });

  it('picks the first available chat id across job kinds', () => {
    const pending = evaluatePendingRenderWork(
      snapshot({
        visuals: [completedVisualRow()],
        videos: [
          videoRow({ episode_localization_id: 'localization-a' }),
          videoRow({
            episode_localization_id: 'localization-b',
            telegram_chat_id: '99',
          }),
        ],
      }),
    );

    expect(pending?.telegramChatId).toBe('99');
  });
});

function machine(
  overrides: Partial<FlyMachineSummary> = {},
): FlyMachineSummary {
  return {
    id: 'machine-render',
    state: 'stopped',
    processGroup: 'render',
    ...overrides,
  };
}

function makeReconciler(input: {
  machines?: FlyMachineSummary[];
  listMachines?: FlyMachinesClient['listMachines'];
  startMachine?: FlyMachinesClient['startMachine'];
  pending?: RenderWorkSnapshot;
  loadSnapshot?: () => Promise<RenderWorkSnapshot>;
}) {
  const startMachine = vi.fn(input.startMachine ?? (async () => undefined));
  const listMachines = vi.fn(
    input.listMachines ?? (async () => input.machines ?? [machine()]),
  );
  const notify = vi.fn(async () => undefined);
  const logger = { info: vi.fn(), error: vi.fn() };
  const loadSnapshot = vi.fn(
    input.loadSnapshot ?? (async () => input.pending ?? snapshot({})),
  );

  const reconciler = createRenderCapacityReconciler({
    machines: { listMachines, startMachine },
    probe: { loadSnapshot },
    notify,
    logger,
  });

  return {
    reconciler,
    startMachine,
    listMachines,
    notify,
    logger,
    loadSnapshot,
  };
}

const QUEUED_VISUAL = snapshot({ visuals: [visualRow()] });

describe('createRenderCapacityReconciler', () => {
  it('constructs default probe, notifier, logger, and poll interval lazily', () => {
    expect(() =>
      createRenderCapacityReconciler({
        machines: {
          listMachines: vi.fn(),
          startMachine: vi.fn(),
        },
      }),
    ).not.toThrow();
  });

  it('never touches the Fly API when nothing is claimable', async () => {
    const { reconciler, listMachines, startMachine } = makeReconciler({});

    await expect(reconciler.runOnce()).resolves.toBe('idle');
    expect(listMachines).not.toHaveBeenCalled();
    expect(startMachine).not.toHaveBeenCalled();
  });

  it('starts a stopped render machine when work is claimable', async () => {
    const { reconciler, startMachine, logger } = makeReconciler({
      pending: QUEUED_VISUAL,
    });

    await expect(reconciler.runOnce()).resolves.toBe('started');
    expect(startMachine).toHaveBeenCalledWith('machine-render');
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('wake machine=machine-render'),
    );
  });

  it('ignores machines outside the render process group', async () => {
    const { reconciler, startMachine, notify } = makeReconciler({
      pending: QUEUED_VISUAL,
      machines: [machine({ id: 'machine-app', processGroup: 'app' })],
    });

    await expect(reconciler.runOnce()).resolves.toBe('no-render-machines');
    expect(startMachine).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('warns once when the render group has no machine at all', async () => {
    const { reconciler, notify } = makeReconciler({
      pending: snapshot({ visuals: [visualRow({ telegram_chat_id: '42' })] }),
      machines: [],
    });

    await expect(reconciler.runOnce()).resolves.toBe('no-render-machines');
    await expect(reconciler.runOnce()).resolves.toBe('no-render-machines');

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      '42',
      expect.stringContaining('無法自動喚醒'),
    );
  });

  it('does nothing while a render machine is already started', async () => {
    const { reconciler, startMachine } = makeReconciler({
      pending: QUEUED_VISUAL,
      machines: [machine({ state: 'started' })],
    });

    await expect(reconciler.runOnce()).resolves.toBe('render-running');
    expect(startMachine).not.toHaveBeenCalled();
  });

  it('falls back to the first render machine when none is explicitly wakeable', async () => {
    const { reconciler, startMachine } = makeReconciler({
      pending: QUEUED_VISUAL,
      machines: [machine({ id: 'machine-created', state: 'created' })],
    });

    await expect(reconciler.runOnce()).resolves.toBe('started');
    expect(startMachine).toHaveBeenCalledWith('machine-created');
  });

  it('wakes a suspended machine too', async () => {
    const { reconciler, startMachine } = makeReconciler({
      pending: QUEUED_VISUAL,
      machines: [machine({ id: 'machine-suspended', state: 'suspended' })],
    });

    await expect(reconciler.runOnce()).resolves.toBe('started');
    expect(startMachine).toHaveBeenCalledWith('machine-suspended');
  });

  it('stops waking after repeated attempts on an unchanged backlog', async () => {
    const { reconciler, startMachine, notify } = makeReconciler({
      pending: snapshot({ visuals: [visualRow({ telegram_chat_id: '42' })] }),
    });

    for (
      let attempt = 0;
      attempt < RENDER_CAPACITY_MAX_REPEATED_WAKES;
      attempt++
    ) {
      await expect(reconciler.runOnce()).resolves.toBe('started');
    }
    await expect(reconciler.runOnce()).resolves.toBe('wake-suppressed');
    await expect(reconciler.runOnce()).resolves.toBe('wake-suppressed');

    expect(startMachine).toHaveBeenCalledTimes(
      RENDER_CAPACITY_MAX_REPEATED_WAKES,
    );
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('resets the repeat guard when the backlog changes', async () => {
    let episodeId = 'episode-1';
    const { reconciler, startMachine } = makeReconciler({
      loadSnapshot: async () =>
        snapshot({ visuals: [visualRow({ episode_id: episodeId })] }),
    });

    for (
      let attempt = 0;
      attempt < RENDER_CAPACITY_MAX_REPEATED_WAKES;
      attempt++
    ) {
      await reconciler.runOnce();
    }
    episodeId = 'episode-2';

    await expect(reconciler.runOnce()).resolves.toBe('started');
    expect(startMachine).toHaveBeenCalledTimes(
      RENDER_CAPACITY_MAX_REPEATED_WAKES + 1,
    );
  });

  it('resets the repeat guard once the queue drains', async () => {
    let pending = snapshot({ visuals: [visualRow()] });
    const { reconciler, startMachine } = makeReconciler({
      loadSnapshot: async () => pending,
    });

    for (
      let attempt = 0;
      attempt < RENDER_CAPACITY_MAX_REPEATED_WAKES;
      attempt++
    ) {
      await reconciler.runOnce();
    }
    pending = snapshot({});
    await expect(reconciler.runOnce()).resolves.toBe('idle');
    pending = snapshot({ visuals: [visualRow()] });

    await expect(reconciler.runOnce()).resolves.toBe('started');
    expect(startMachine).toHaveBeenCalledTimes(
      RENDER_CAPACITY_MAX_REPEATED_WAKES + 1,
    );
  });

  it('normalizes non-Error start-machine failures', async () => {
    const { reconciler, logger } = makeReconciler({
      pending: QUEUED_VISUAL,
      startMachine: async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately a non-Error throw, the subject under test
        throw 'machine unavailable';
      },
    });

    await expect(reconciler.runOnce()).resolves.toBe('error');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Fly Machines API call failed'),
      expect.objectContaining({ message: 'machine unavailable' }),
    );
  });

  it('warns once after consecutive Fly API failures', async () => {
    const { reconciler, notify, logger } = makeReconciler({
      pending: snapshot({ visuals: [visualRow({ telegram_chat_id: '42' })] }),
      listMachines: async () => {
        throw new Error('fly api unauthorized');
      },
    });

    for (
      let attempt = 0;
      attempt < RENDER_CAPACITY_MAX_API_FAILURES;
      attempt++
    ) {
      await expect(reconciler.runOnce()).resolves.toBe('error');
    }
    await expect(reconciler.runOnce()).resolves.toBe('error');

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      '42',
      expect.stringContaining('fly api unauthorized'),
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('reports an error without waking when the pending lookup fails', async () => {
    const { reconciler, listMachines } = makeReconciler({
      loadSnapshot: async () => {
        throw new Error('supabase unreachable');
      },
    });

    await expect(reconciler.runOnce()).resolves.toBe('error');
    expect(listMachines).not.toHaveBeenCalled();
  });

  it('logs the wake failure without Telegram when no chat is known', async () => {
    const { reconciler, notify, logger } = makeReconciler({
      pending: QUEUED_VISUAL,
      listMachines: async () => {
        throw new Error('fly api down');
      },
    });

    for (
      let attempt = 0;
      attempt < RENDER_CAPACITY_MAX_API_FAILURES;
      attempt++
    ) {
      await reconciler.runOnce();
    }

    expect(notify).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('cannot be woken'),
    );
  });

  it('ignores repeated starts and refuses to restart after stop', async () => {
    vi.useFakeTimers();
    try {
      const { reconciler, loadSnapshot } = makeReconciler({});
      reconciler.start();
      reconciler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(loadSnapshot).toHaveBeenCalledTimes(1);

      reconciler.stop();
      reconciler.start();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(loadSnapshot).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('catches unexpected poll errors without leaving the polling guard stuck', async () => {
    vi.useFakeTimers();
    try {
      const logger = {
        info: vi
          .fn()
          .mockImplementationOnce(() => undefined)
          .mockImplementationOnce(() => {
            throw new Error('logging failed');
          }),
        error: vi.fn(),
      };
      const reconciler = createRenderCapacityReconciler({
        machines: {
          listMachines: vi.fn(async () => [machine()]),
          startMachine: vi.fn(async () => undefined),
        },
        probe: { loadSnapshot: vi.fn(async () => QUEUED_VISUAL) },
        notify: vi.fn(async () => undefined),
        logger,
        pollIntervalMs: 10,
      });

      reconciler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(logger.error).toHaveBeenCalledWith(
        '[render-capacity] poll failed',
        expect.objectContaining({ message: 'logging failed' }),
      );
      await vi.advanceTimersByTimeAsync(10);
      reconciler.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('polls on an interval and stops cleanly', async () => {
    vi.useFakeTimers();
    try {
      const { reconciler, loadSnapshot } = makeReconciler({});

      reconciler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(loadSnapshot).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(loadSnapshot).toHaveBeenCalledTimes(3);

      reconciler.stop();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(loadSnapshot).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

interface RecordedQuery {
  table: string;
  filters: unknown[][];
}

function makeSupabase(
  rowsByCall: unknown[][],
  errorsByCall: unknown[] = [],
  nullDataCalls: number[] = [],
) {
  const calls: RecordedQuery[] = [];
  let index = 0;
  const from = vi.fn((table: string) => {
    const callIndex = index;
    const rows = rowsByCall[index] ?? [];
    const error = errorsByCall[index] ?? null;
    index += 1;
    const filters: unknown[][] = [];
    calls.push({ table, filters });
    const query: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: nullDataCalls.includes(callIndex) ? null : rows,
          error,
        }).then(resolve),
    };
    for (const name of ['select', 'in', 'returns']) {
      query[name] = vi.fn((...args: unknown[]) => {
        filters.push([name, ...args]);
        return query;
      });
    }
    return query;
  });
  return { supabase: { from } as never, calls };
}

function expectedProbeFailureMessage(error: unknown): string {
  if (error instanceof Error) return 'database offline';
  if ('message' in error) return 'structured failure';
  return 'Supabase render work query failed';
}

describe('createRenderWorkProbe', () => {
  it('loads active rows from both job tables', async () => {
    const { supabase, calls } = makeSupabase([[videoRow()], [visualRow()]]);

    const loaded = await createRenderWorkProbe(supabase).loadSnapshot();

    expect(loaded.videos).toEqual([videoRow()]);
    expect(loaded.visuals).toEqual([visualRow()]);
    expect(calls.map((call) => call.table)).toEqual([
      'episode_videos',
      'episode_video_visuals',
    ]);
    expect(calls[0]?.filters).toContainEqual([
      'in',
      'status',
      ['queued', 'processing', 'failed'],
    ]);
  });

  it('fetches the completed visual row for episodes with active render work', async () => {
    const { supabase, calls } = makeSupabase([
      [videoRow({ episode_id: 'episode-9' })],
      [],
      [completedVisualRow({ episode_id: 'episode-9' })],
    ]);

    const loaded = await createRenderWorkProbe(supabase).loadSnapshot();

    expect(loaded.visuals).toEqual([
      completedVisualRow({ episode_id: 'episode-9' }),
    ]);
    expect(calls[2]?.filters).toContainEqual([
      'in',
      'episode_id',
      ['episode-9'],
    ]);
  });

  it('skips the third query when the active visuals already cover every episode', async () => {
    const { supabase, calls } = makeSupabase([[videoRow()], [visualRow()]]);

    await createRenderWorkProbe(supabase).loadSnapshot();

    expect(calls).toHaveLength(2);
  });

  it('treats null Supabase data as an empty row set', async () => {
    const { supabase } = makeSupabase([[], []], [], [0, 1]);
    await expect(
      createRenderWorkProbe(supabase).loadSnapshot(),
    ).resolves.toMatchObject({
      videos: [],
      visuals: [],
    });
  });

  it('propagates Error, structured, and message-less Supabase failures', async () => {
    for (const error of [
      new Error('database offline'),
      { message: 'structured failure' },
      {},
    ]) {
      const { supabase } = makeSupabase([[], []], [error]);
      const expectedMessage = expectedProbeFailureMessage(error);
      await expect(
        createRenderWorkProbe(supabase).loadSnapshot(),
      ).rejects.toThrow(expectedMessage);
    }
  });
});
