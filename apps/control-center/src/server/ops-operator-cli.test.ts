import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: { SERVICE: 'test' },
  operations: { marker: 'operations-service' },
  store: { marker: 'operator-store' },
  cycleResult: { state: 'idle' },
  rpcArgs: null as unknown,
  runInput: null as unknown,
  aggregateInput: null as unknown,
  storeConfig: null as unknown,
  parsedFix: null as unknown,
}));

vi.mock('./config/env.js', () => ({
  readControlCenterConfig: () => state.config,
}));
vi.mock('./services/operations/aggregate.js', () => ({
  createOperationsService: (input: unknown) => {
    state.aggregateInput = input;
    return state.operations;
  },
}));
vi.mock('./services/operations/operator/store.js', () => ({
  createOperatorStore: (config: unknown) => {
    state.storeConfig = config;
    return {
      rpc: (...args: unknown[]) => {
        state.rpcArgs = args;
        return Promise.resolve({ ok: true });
      },
    };
  },
}));
vi.mock('./services/operations/operator/runner.js', () => ({
  runOperatorCycle: (input: unknown) => {
    state.runInput = input;
    return Promise.resolve(state.cycleResult);
  },
}));
vi.mock('./services/operations/operator/observe.js', () => ({
  fixSchema: {
    parse: (value: unknown) => {
      state.parsedFix = value;
      return { incidentId: 'incident-1', ...(value as object) };
    },
  },
}));

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
  state.rpcArgs = null;
  state.runInput = null;
  state.aggregateInput = null;
  state.storeConfig = null;
  state.parsedFix = null;
  state.cycleResult = { state: 'idle' };
});

afterEach(() => {
  process.argv = argvBackup;
  process.stdout.write = writeBackup;
  vi.restoreAllMocks();
});

describe('ops-operator-cli entrypoint', () => {
  it('throws when --record-fix names no file', async () => {
    process.argv = ['node', 'ops-operator-cli.ts', '--record-fix'];
    await expect(import('./ops-operator-cli.js')).rejects.toThrow(
      '--record-fix requires a JSON file.',
    );
  });

  it('registers a fix file then runs the cycle without mutations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ops-fix-'));
    const file = join(dir, 'fix.json');
    writeFileSync(file, JSON.stringify({ incidentId: 'incident-1' }));
    process.argv = ['node', 'ops-operator-cli.ts', '--record-fix', file];

    await import('./ops-operator-cli.js');

    const rpcArgs = state.rpcArgs as [string, Record<string, unknown>];
    expect(rpcArgs[0]).toBe('ops_register_fix');
    expect(rpcArgs[1]).toMatchObject({ p_incident: 'incident-1' });
    const runInput = state.runInput as { mutationsEnabled: boolean };
    expect(runInput.mutationsEnabled).toBe(false);
    expect(state.storeConfig).toBe(state.config);
    expect(state.aggregateInput).toEqual({ config: state.config });
    expect(writeCalls.join('')).toContain('"state": "idle"');
  });

  it('runs the cycle directly when no fix is recorded', async () => {
    process.argv = ['node', 'ops-operator-cli.ts'];
    await import('./ops-operator-cli.js');

    expect(state.rpcArgs).toBeNull();
    const runInput = state.runInput as {
      actor: string;
      mutationsEnabled: boolean;
    };
    expect(runInput.actor).toBe('ops-operator-cli');
    expect(runInput.mutationsEnabled).toBe(false);
    expect(writeCalls.join('')).toContain('"state": "idle"');
  });

  it('enables render-retry mutations only with --allow-render-retry', async () => {
    process.argv = ['node', 'ops-operator-cli.ts', '--allow-render-retry'];
    await import('./ops-operator-cli.js');

    const runInput = state.runInput as { mutationsEnabled: boolean };
    expect(runInput.mutationsEnabled).toBe(true);
  });
});
