import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ensureAccountBootstrap,
  isAccountBootstrapped,
  resetAccountBootstrapForTests,
  resumeAccountBootstrap,
  suspendAccountBootstrap,
} from '@core/lib/state/accountBootstrap';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  resetAccountBootstrapForTests();
});

describe('account bootstrap suspension races', () => {
  it('keeps the resumed session in flight when the suspended session settles late', async () => {
    const staleGate = deferred();
    const resumedGate = deferred();
    const bootstrap = vi
      .fn()
      .mockImplementationOnce(() => staleGate.promise)
      .mockImplementationOnce(() => resumedGate.promise);

    const stale = ensureAccountBootstrap('0xaaa', bootstrap);
    suspendAccountBootstrap('0xaaa');
    resumeAccountBootstrap('0xaaa');
    const resumed = ensureAccountBootstrap('0xaaa', bootstrap);

    expect(bootstrap).toHaveBeenCalledTimes(2);

    staleGate.resolve();
    await expect(stale).resolves.toBe('stale');
    await Promise.resolve();

    const lateConsumer = ensureAccountBootstrap('0xaaa', bootstrap);
    expect(lateConsumer).toBe(resumed);
    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(isAccountBootstrapped('0xaaa')).toBe(false);

    resumedGate.resolve();
    await expect(resumed).resolves.toBe('ready');
    await expect(lateConsumer).resolves.toBe('ready');
    expect(isAccountBootstrapped('0xaaa')).toBe(true);
  });
});
