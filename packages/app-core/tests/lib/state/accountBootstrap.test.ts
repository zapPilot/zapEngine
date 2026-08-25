import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAccountBootstrap,
  ensureAccountBootstrap,
  isAccountBootstrapped,
  isAccountBootstrapSuspended,
  resetAccountBootstrapForTests,
  resumeAccountBootstrap,
  suspendAccountBootstrap,
} from '@core/lib/state/accountBootstrap';

function deferred() {
  let resolve!: (value?: void) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMacrotasks(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  resetAccountBootstrapForTests();
});

describe('ensureAccountBootstrap', () => {
  it('collapses concurrent callers into one bootstrap call', async () => {
    const gate = deferred();
    const bootstrap = vi.fn(() => gate.promise);

    const pending = Promise.all([
      ensureAccountBootstrap('0xaaa', bootstrap),
      ensureAccountBootstrap('0xaaa', bootstrap),
      ensureAccountBootstrap('0xaaa', bootstrap),
      ensureAccountBootstrap('0xaaa', bootstrap),
    ]);
    expect(bootstrap).toHaveBeenCalledTimes(1);

    gate.resolve();
    const outcomes = await pending;

    expect(outcomes).toEqual(['ready', 'ready', 'ready', 'ready']);
    expect(isAccountBootstrapped('0xaaa')).toBe(true);
  });

  it('returns ready without bootstrapping an already-bootstrapped wallet', async () => {
    const bootstrap = vi.fn(async () => undefined);

    expect(await ensureAccountBootstrap('0xaaa', bootstrap)).toBe('ready');
    expect(await ensureAccountBootstrap('0xAAA ', bootstrap)).toBe('ready');

    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('never bootstraps a suspended wallet', async () => {
    suspendAccountBootstrap('0xaaa');
    const bootstrap = vi.fn(async () => undefined);

    const outcome = await ensureAccountBootstrap('0xaaa', bootstrap);

    expect(outcome).toBe('suspended');
    expect(bootstrap).not.toHaveBeenCalled();
    expect(isAccountBootstrapped('0xaaa')).toBe(false);
  });

  it('rejects all waiters on failure and allows a clean retry', async () => {
    const gate = deferred();
    const bootstrap = vi
      .fn()
      .mockImplementationOnce(() => gate.promise)
      .mockImplementationOnce(async () => undefined);

    const first = ensureAccountBootstrap('0xaaa', bootstrap);
    const second = ensureAccountBootstrap('0xaaa', bootstrap);

    gate.reject(new Error('network down'));

    await expect(first).rejects.toThrow('network down');
    await expect(second).rejects.toThrow('network down');

    const retried = ensureAccountBootstrap('0xaaa', bootstrap);
    await flushMacrotasks();

    expect(bootstrap).toHaveBeenCalledTimes(2);
    await expect(retried).resolves.toBe('ready');
  });

  it('marks completion stale when the session was cleared mid-flight', async () => {
    const gate = deferred();
    const bootstrap = () => gate.promise;

    const pending = ensureAccountBootstrap('0xaaa', bootstrap);
    clearAccountBootstrap('0xaaa');
    gate.resolve();

    expect(await pending).toBe('stale');
    expect(isAccountBootstrapped('0xaaa')).toBe(false);
  });

  it('marks completion stale when the wallet was suspended mid-flight', async () => {
    const gate = deferred();
    const bootstrap = () => gate.promise;

    const pending = ensureAccountBootstrap('0xaaa', bootstrap);
    suspendAccountBootstrap('0xaaa');
    gate.resolve();

    expect(await pending).toBe('stale');
    expect(isAccountBootstrapped('0xaaa')).toBe(false);

    resumeAccountBootstrap('0xaaa');
    const resumed = ensureAccountBootstrap('0xaaa', bootstrap);
    await flushMacrotasks();
    await expect(resumed).resolves.toBe('ready');
  });

  it('keeps a newer in-flight promise when a cleared older one settles', async () => {
    const gateA = deferred();
    const gateB = deferred();
    const bootstrap = vi
      .fn()
      .mockImplementationOnce(() => gateA.promise)
      .mockImplementationOnce(() => gateB.promise);

    const firstA = ensureAccountBootstrap('0xaaa', bootstrap);
    clearAccountBootstrap('0xaaa');
    const second = ensureAccountBootstrap('0xaaa', bootstrap);

    gateA.resolve();
    await flushMacrotasks();

    expect(firstA).toBeInstanceOf(Promise);
    const third = ensureAccountBootstrap('0xaaa', bootstrap);
    expect(third).toBe(second);
    expect(bootstrap).toHaveBeenCalledTimes(2);

    gateB.resolve();
    await expect(second).resolves.toBe('ready');
    await expect(third).resolves.toBe('ready');
  });

  it('normalizes wallet keys across every API', async () => {
    const bootstrap = vi.fn(async () => undefined);

    await ensureAccountBootstrap(' 0xAbC ', bootstrap);
    suspendAccountBootstrap('0xABC');
    expect(isAccountBootstrapSuspended('0xabc')).toBe(true);
    expect(isAccountBootstrapped('0XABC')).toBe(false);

    resumeAccountBootstrap('0xabc');
    const next = ensureAccountBootstrap('0xabc', bootstrap);
    await flushMacrotasks();
    await expect(next).resolves.toBe('ready');
    expect(bootstrap).toHaveBeenCalledTimes(2);
  });

  it('treats different wallets as independent sessions', async () => {
    const bootstrap = vi.fn(async () => undefined);

    await expect(ensureAccountBootstrap('0xaaa', bootstrap)).resolves.toBe(
      'ready',
    );
    await expect(ensureAccountBootstrap('0xbbb', bootstrap)).resolves.toBe(
      'ready',
    );

    expect(bootstrap).toHaveBeenCalledTimes(2);
  });
});
