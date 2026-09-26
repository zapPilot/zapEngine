import { describe, expect, it, vi } from 'vitest';

import type { Multibaas } from '../lib/multibaas.js';
import { USDC, VAULT } from './demoRule.js';
import { multibaasSetup } from './multibaasSetup.js';

function fake(
  contracts: { label: string; version: string }[],
  addresses: Record<
    string,
    { address: string; contracts: { label: string }[] }
  >,
) {
  return {
    status: vi.fn(async () => ({ chainID: 8453 as const, blockNumber: 123 })),
    contracts: vi.fn(async () => contracts),
    createContract: vi.fn<Multibaas['createContract']>(async () => undefined),
    address: vi.fn(async (alias: string) =>
      addresses[alias] ? { alias, ...addresses[alias] } : null,
    ),
    createAddress: vi.fn(async () => undefined),
    linkContract: vi.fn(async () => undefined),
  };
}

describe('MultiBaas setup', () => {
  it('registers raw ABIs, aliases and links from the current block', async () => {
    const mb = fake([], {});
    const lines: string[] = [];
    await multibaasSetup(mb as unknown as Multibaas, (l) => lines.push(l));
    expect(mb.createContract.mock.calls.map((c) => c[0].label)).toEqual([
      'usdctoken',
      'sparkusdcvault',
    ]);
    expect(mb.createAddress.mock.calls).toEqual([
      ['usdc', USDC],
      ['sparkusdcvault', VAULT],
    ]);
    expect(mb.linkContract).toHaveBeenCalledWith('usdc', {
      label: 'usdctoken',
      version: '1.0',
      startingBlock: '123',
    });
    expect(lines.at(-1)).toBe('MultiBaas setup complete');
  });
  it('is idempotent and refuses a conflicting alias', async () => {
    const done = fake(
      [
        { label: 'usdctoken', version: '1.0' },
        { label: 'sparkusdcvault', version: '1.0' },
      ],
      {
        usdc: { address: USDC, contracts: [{ label: 'usdctoken' }] },
        sparkusdcvault: {
          address: VAULT,
          contracts: [{ label: 'sparkusdcvault' }],
        },
      },
    );
    await multibaasSetup(done as unknown as Multibaas, () => undefined);
    expect(done.createContract).not.toHaveBeenCalled();
    expect(done.createAddress).not.toHaveBeenCalled();
    expect(done.linkContract).not.toHaveBeenCalled();
    const conflict = fake([], { usdc: { address: VAULT, contracts: [] } });
    await expect(
      multibaasSetup(conflict as unknown as Multibaas, () => undefined),
    ).rejects.toThrow('already points at');
  });
});
