import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  repository: { marker: 'coverage-repo' } as unknown,
  syncCalls: [] as Array<{ interactive: boolean }>,
}));

vi.mock('./config/env.js', () => ({
  readControlCenterConfig: () => ({ SERVICE: 'coverage' }),
}));

vi.mock('./services/cost-repository.js', () => ({
  createCostRepository: () => state.repository,
}));

vi.mock('./services/fly-billing/index.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./services/fly-billing/index.js')>();
  return {
    ...actual,
    FLY_BILLING_MAX_AGE_MS: 5,
    syncFlyBilling: (input: {
      interactive?: boolean;
      onLog?: (message: string) => void;
    }) => {
      state.syncCalls.push({ interactive: input.interactive ?? false });
      input.onLog?.('dashboard read ok');
      return Promise.resolve({
        status: 'recorded',
        message: 'Recorded Fly month-to-date spend of $1.23',
        amountUsd: 1.23,
      } as const);
    },
  };
});

let writeBackup: typeof process.stdout.write;
let exitBackup: typeof process.exit;
let onBackup: typeof process.on;
let writeCalls: string[];
let exitCalls: number[];

beforeEach(() => {
  vi.resetModules();
  state.repository = { marker: 'coverage-repo' };
  state.syncCalls = [];
  writeBackup = process.stdout.write;
  writeCalls = [];
  process.stdout.write = ((chunk: unknown) => {
    writeCalls.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  exitBackup = process.exit;
  exitCalls = [];
  (process as unknown as { exit: typeof process.exit }).exit = ((
    code?: unknown,
  ) => {
    exitCalls.push(code as number);
    return undefined as never;
  }) as typeof process.exit;
  onBackup = process.on;
  (process as unknown as { on: typeof process.on }).on = (() =>
    process) as typeof process.on;
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

describe('fly-billing daemon coverage gaps', () => {
  it('loops past the first cycle through the sleep boundary', async () => {
    const daemon = await import('./fly-billing-daemon.js');
    daemon.__resetFlyBillingDaemonForTest();

    await daemon.runDaemon({ maxCycles: 2 });

    expect(state.syncCalls).toEqual([
      { interactive: false },
      { interactive: false },
    ]);
    expect(output()).toContain('reading the Fly dashboard every');
    expect(output()).toContain('Recorded Fly month-to-date spend of $1.23');
  });

  it('forwards collector progress through the per-cycle logger', async () => {
    const daemon = await import('./fly-billing-daemon.js');
    daemon.__resetFlyBillingDaemonForTest();

    await daemon.runOnce();

    expect(state.syncCalls).toEqual([{ interactive: false }]);
    expect(output()).toContain('fly-billing: dashboard read ok');
  });

  it('starts itself on import outside the test environment', async () => {
    const previousNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    state.repository = null;
    try {
      await import('./fly-billing-daemon.js');
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(output()).toContain(
        'fly-billing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
      );
      expect(exitCalls).toEqual([0]);
    } finally {
      process.env['NODE_ENV'] = previousNodeEnv;
    }
  });
});
