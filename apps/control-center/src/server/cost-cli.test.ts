import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: { SERVICE: 'test' },
  repository: null as null | {
    upsertRecordedSnapshot: (...args: unknown[]) => Promise<unknown>;
    insertTransaction: (...args: unknown[]) => Promise<unknown>;
  },
  upsertArgs: null as unknown,
  insertArgs: null as unknown,
  createArgs: null as unknown,
}));

vi.mock('./config/env.js', () => ({
  readControlCenterConfig: () => state.config,
}));
vi.mock('./services/cost-repository.js', () => ({
  createCostRepository: (config: unknown) => {
    state.createArgs = config;
    return state.repository;
  },
}));

function makeRepository() {
  return {
    upsertRecordedSnapshot: vi.fn((input: unknown) => {
      state.upsertArgs = input;
      return Promise.resolve();
    }),
    insertTransaction: vi.fn((input: unknown) => {
      state.insertArgs = input;
      return Promise.resolve();
    }),
  };
}

let argvBackup: string[];
let writeBackup: typeof process.stdout.write;
let writeCalls: string[];

beforeEach(() => {
  vi.resetModules();
  argvBackup = [...process.argv];
  writeBackup = process.stdout.write;
  writeCalls = [];
  process.stdout.write = ((chunk: unknown) => {
    writeCalls.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  state.repository = makeRepository();
  state.upsertArgs = null;
  state.insertArgs = null;
  state.createArgs = null;
});

afterEach(() => {
  process.argv = argvBackup;
  process.stdout.write = writeBackup;
  vi.restoreAllMocks();
});

function setArgv(args: string[]) {
  process.argv = ['node', 'cost-cli.ts', ...args];
}

describe('ops:cost entrypoint', () => {
  it('prints usage when no command is given', async () => {
    setArgv([]);
    await expect(import('./cost-cli.js')).rejects.toThrow('Usage:');
  });

  it('prints usage for an unknown command', async () => {
    setArgv(['bogus', 'fly', '12']);
    await expect(import('./cost-cli.js')).rejects.toThrow('Usage:');
  });

  it('refuses to run without Supabase configuration', async () => {
    state.repository = null;
    setArgv(['snapshot', 'fly', '12.5']);
    await expect(import('./cost-cli.js')).rejects.toThrow(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    );
    expect(state.createArgs).toBe(state.config);
  });

  it('rejects an unknown provider', async () => {
    setArgv(['snapshot', 'nope', '12.5']);
    await expect(import('./cost-cli.js')).rejects.toThrow('Unknown provider:');
  });

  it('rejects a missing provider', async () => {
    setArgv(['snapshot']);
    await expect(import('./cost-cli.js')).rejects.toThrow(
      'Unknown provider: (missing)',
    );
  });

  it('records a manual snapshot', async () => {
    setArgv(['snapshot', 'fly', '12.5']);
    await import('./cost-cli.js');

    expect(state.upsertArgs).toMatchObject({
      provider: 'fly',
      amountUsd: 12.5,
      source: 'manual',
    });
    expect(writeCalls.join('')).toContain('Saved fly manual snapshot: $12.50');
  });

  it('rejects a non-numeric snapshot amount', async () => {
    setArgv(['snapshot', 'fly', 'plenty']);
    await expect(import('./cost-cli.js')).rejects.toThrow(
      'Invalid USD amount:',
    );
  });

  it('rejects a negative snapshot amount', async () => {
    setArgv(['snapshot', 'fly', '-1']);
    await expect(import('./cost-cli.js')).rejects.toThrow(
      'Invalid USD amount:',
    );
  });

  it('rejects a missing snapshot amount', async () => {
    setArgv(['snapshot', 'fly']);
    await expect(import('./cost-cli.js')).rejects.toThrow(
      'Invalid USD amount: (missing)',
    );
  });

  it('records a subscription transaction without a description', async () => {
    setArgv(['transaction', 'supabase', 'subscription', '25']);
    await import('./cost-cli.js');

    expect(state.insertArgs).toMatchObject({
      provider: 'supabase',
      amountUsd: 25,
      kind: 'subscription',
      source: 'manual-cli',
      description: null,
    });
    expect(writeCalls.join('')).toContain(
      'Saved supabase subscription transaction: $25.00',
    );
  });

  it('records a top_up transaction with a description', async () => {
    setArgv(['transaction', 'openrouter', 'top_up', '10', 'evening', 'top-up']);
    await import('./cost-cli.js');

    expect(state.insertArgs).toMatchObject({
      provider: 'openrouter',
      kind: 'top_up',
      amountUsd: 10,
      description: 'evening top-up',
    });
    expect(writeCalls.join('')).toContain('top_up transaction');
  });

  it('records an invoice transaction', async () => {
    setArgv(['transaction', 'debank', 'invoice', '7.25', 'august']);
    await import('./cost-cli.js');

    expect(state.insertArgs).toMatchObject({
      provider: 'debank',
      kind: 'invoice',
    });
  });

  it('records an adjustment transaction', async () => {
    setArgv(['transaction', 'brave', 'adjustment', '1.5']);
    await import('./cost-cli.js');

    expect(state.insertArgs).toMatchObject({
      provider: 'brave',
      kind: 'adjustment',
      description: null,
    });
  });

  it('rejects an unknown transaction kind', async () => {
    setArgv(['transaction', 'fly', 'windfall', '5']);
    await expect(import('./cost-cli.js')).rejects.toThrow(
      'Unknown transaction kind:',
    );
  });

  it('rejects a missing transaction kind', async () => {
    setArgv(['transaction', 'fly']);
    await expect(import('./cost-cli.js')).rejects.toThrow(
      'Unknown transaction kind: (missing)',
    );
  });

  it('rejects an invalid transaction amount', async () => {
    setArgv(['transaction', 'fly', 'invoice', 'NaN']);
    await expect(import('./cost-cli.js')).rejects.toThrow(
      'Invalid USD amount:',
    );
  });
});
