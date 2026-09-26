import { afterEach, expect, it, vi } from 'vitest';

import { hash, payload, txm, wallet } from '../test-utils/fixtures.js';
import { smoke } from './smoke.js';
afterEach(() => vi.restoreAllMocks());
it.each(['confirmed', 'failed', 'timeout'])(
  'reports smoke %s without pretending uncertain results succeeded',
  async (outcome) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const p = { ...payload(), to: wallet, data: '0x' };
    const chain = {
      assertChain: vi.fn(),
      nonce: vi.fn().mockResolvedValue(7),
      prepare: vi.fn().mockResolvedValue(p),
      receipt: vi.fn().mockResolvedValue(null),
    };
    const signer = {
      submit: vi.fn().mockResolvedValue(hash),
      txmByNonce: vi
        .fn()
        .mockResolvedValue(
          outcome === 'timeout'
            ? []
            : [{ ...txm(p), failed: outcome === 'failed' }],
        ),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const run = smoke(chain, signer, wallet, sleep);
    await (outcome === 'confirmed' ? run : expect(run).rejects.toThrow());
    expect(signer.submit).toHaveBeenCalledTimes(1);
    expect(signer.submit).toHaveBeenCalledWith(p);
    if (outcome === 'timeout') expect(sleep).toHaveBeenCalledTimes(36);
  },
);
it('confirms smoke from the chain receipt when TXM omits the failed flag', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const p = { ...payload(), to: wallet, data: '0x' };
  const chain = {
    assertChain: vi.fn(),
    nonce: vi.fn().mockResolvedValue(7),
    prepare: vi.fn().mockResolvedValue(p),
    receipt: vi.fn().mockResolvedValue('success'),
  };
  const signer = {
    submit: vi.fn().mockResolvedValue(hash),
    txmByNonce: vi.fn().mockResolvedValue([{ ...txm(p), failed: undefined }]),
  };
  await smoke(chain, signer, wallet, vi.fn());
  expect(chain.receipt).toHaveBeenCalledWith(hash);
});
