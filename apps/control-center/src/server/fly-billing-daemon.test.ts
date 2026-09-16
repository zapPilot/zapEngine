import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  repository: { marker: 'repository' } as unknown,
  syncCalls: [] as Array<{ interactive: boolean }>,
  syncResults: [] as Array<unknown>,
  syncThrows: [] as Array<unknown>,
  exitCalls: [] as number[],
  onListeners: new Map<string, Array<() => void>>(),
}));

vi.mock('./config/env.js', () => ({
  readControlCenterConfig: () => ({ SERVICE: 'test' }),
}));
vi.mock('./services/cost-repository.js', () => ({
  createCostRepository: () => state.repository,
}));
vi.mock('./services/supabase.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./services/supabase.js')>();
  return { ...actual };
});
vi.mock('./services/fly-billing/index.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./services/fly-billing/index.js')>();
  return {
    ...actual,
    syncFlyBilling: (input: {
      interactive?: boolean;
      onLog?: (message: string) => void;
    }) => {
      state.syncCalls.push({ interactive: input.interactive ?? false });
      if (state.syncThrows.length > 0) {
        const failure = state.syncThrows.shift();
        return Promise.reject(failure);
      }
      const next = state.syncResults.shift();
      return Promise.resolve(
        next ??
          ({ status: 'recorded', message: 'Recorded', amountUsd: 1 } as const),
      );
    },
  };
});

function recorded(message = 'Recorded Fly month-to-date spend of $4.57') {
  return { status: 'recorded' as const, message, amountUsd: 4.57 };
}

function authRequired() {
  return {
    status: 'auth_required' as const,
    message:
      'Fly is not signed in for the billing profile; the ledger keeps its current figure',
    amountUsd: null,
  };
}

let writeBackup: typeof process.stdout.write;
let exitBackup: typeof process.exit;
let onBackup: typeof process.on;
let writeCalls: string[];

beforeEach(() => {
  vi.resetModules();
  writeBackup = process.stdout.write;
  writeCalls = [];
  process.stdout.write = ((chunk: unknown) => {
    writeCalls.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  exitBackup = process.exit;
  state.exitCalls = [];
  (process as unknown as { exit: typeof process.exit }).exit = ((
    code?: unknown,
  ) => {
    state.exitCalls.push(code as number);
    throw new Error(`process.exit(${String(code)})`);
  }) as typeof process.exit;
  onBackup = process.on;
  state.onListeners = new Map();
  (
    process as unknown as {
      on: (event: string, listener: () => void) => unknown;
    }
  ).on = ((event: string, listener: () => void) => {
    const list = state.onListeners.get(event) ?? [];
    list.push(listener);
    state.onListeners.set(event, list);
    return process;
  }) as typeof process.on;
  state.repository = { marker: 'repository' };
  state.syncCalls = [];
  state.syncResults = [];
  state.syncThrows = [];
});

afterEach(() => {
  process.stdout.write = writeBackup;
  process.exit = exitBackup;
  process.on = onBackup;
  vi.restoreAllMocks();
});

function output() {
  return writeCalls.join('');
}

describe('fly-billing daemon', () => {
  it('exits 0 with a hint when Supabase is not configured', async () => {
    state.repository = null;
    const daemon = await import('./fly-billing-daemon.js');

    await expect(daemon.runDaemon({ maxCycles: 1 })).rejects.toThrow(
      'process.exit(0)',
    );
    expect(output()).toContain(
      'fly-billing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    );
    expect(state.exitCalls).toEqual([0]);
  });

  it('registers SIGINT and SIGTERM to stop with exit 0', async () => {
    const daemon = await import('./fly-billing-daemon.js');
    daemon.__resetFlyBillingDaemonForTest();

    await daemon.runDaemon({ maxCycles: 1 });

    expect([...state.onListeners.keys()].sort()).toEqual(['SIGINT', 'SIGTERM']);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      state.exitCalls = [];
      const listeners = state.onListeners.get(signal) ?? [];
      expect(listeners).toHaveLength(1);
      expect(() => listeners[0]!()).toThrow('process.exit(0)');
      expect(state.exitCalls).toEqual([0]);
      expect(daemon.__isFlyBillingDaemonStoppingForTest()).toBe(true);
      daemon.__resetFlyBillingDaemonForTest();
    }
    expect(output()).toContain('reading the Fly dashboard every');
  });

  it('records a headless read and prints its message', async () => {
    const daemon = await import('./fly-billing-daemon.js');
    daemon.__resetFlyBillingDaemonForTest();
    state.syncResults = [recorded()];

    await daemon.runOnce();

    expect(state.syncCalls).toEqual([{ interactive: false }]);
    expect(output()).toContain('Recorded Fly month-to-date spend of $4.57');
  });

  it('opens one interactive window after the first auth_required', async () => {
    const daemon = await import('./fly-billing-daemon.js');
    daemon.__resetFlyBillingDaemonForTest();
    state.syncResults = [authRequired(), recorded('Recorded after sign-in')];

    await daemon.runOnce();

    expect(state.syncCalls).toEqual([
      { interactive: false },
      { interactive: true },
    ]);
    expect(output()).toContain('Recorded after sign-in');
    expect(output()).not.toContain('still signed out');
  });

  it('stays headless on later auth_required cycles and says it is signed out', async () => {
    const daemon = await import('./fly-billing-daemon.js');
    daemon.__resetFlyBillingDaemonForTest();
    state.syncResults = [authRequired(), authRequired()];
    await daemon.runOnce();
    expect(state.syncCalls).toEqual([
      { interactive: false },
      { interactive: true },
    ]);

    writeCalls = [];
    state.syncCalls = [];
    state.syncResults = [authRequired()];
    await daemon.runOnce();

    expect(state.syncCalls).toEqual([{ interactive: false }]);
    expect(output()).toContain(
      'fly-billing: still signed out — restart `pnpm ops` when you are ready to sign in',
    );
    expect(output()).toContain('ledger keeps its current figure');
  });

  it('formats a PostgREST rejection instead of printing [object Object]', async () => {
    const daemon = await import('./fly-billing-daemon.js');
    daemon.__resetFlyBillingDaemonForTest();
    state.syncThrows = [{ message: 'duplicate key value', code: '23505' }];

    await daemon.runOnce();

    expect(output()).toContain('read failed, retrying next cycle');
    expect(output()).toContain('duplicate key value');
    expect(output()).not.toContain('[object Object]');
  });

  it('formats an Error crash with its message', async () => {
    const daemon = await import('./fly-billing-daemon.js');
    daemon.__resetFlyBillingDaemonForTest();
    state.syncThrows = [new Error('network down')];

    await daemon.runOnce();

    expect(output()).toContain('network down');
  });

  it('sleep resolves without holding extra handles', async () => {
    const daemon = await import('./fly-billing-daemon.js');
    await expect(daemon.sleep(5)).resolves.toBeUndefined();
  });
});
