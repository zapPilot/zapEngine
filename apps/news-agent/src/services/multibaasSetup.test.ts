import { describe, expect, it, vi } from 'vitest';

import type { Multibaas } from '../lib/multibaas.js';
import { ETH_VAULT, USDC, USDC_VAULT, WETH } from './demoRule.js';
import { missingRegistrations, multibaasSetup } from './multibaasSetup.js';

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
      'wethtoken',
      'clearstarethvault',
      'usdctoken',
      'sparkusdcvault',
    ]);
    expect(mb.createAddress.mock.calls).toEqual([
      ['weth', WETH],
      ['clearstarethvault', ETH_VAULT],
      ['usdc', USDC],
      ['sparkusdcvault', USDC_VAULT],
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
        { label: 'wethtoken', version: '1.0' },
        { label: 'clearstarethvault', version: '1.0' },
        { label: 'usdctoken', version: '1.0' },
        { label: 'sparkusdcvault', version: '1.0' },
      ],
      {
        weth: { address: WETH, contracts: [{ label: 'wethtoken' }] },
        clearstarethvault: {
          address: ETH_VAULT,
          contracts: [{ label: 'clearstarethvault' }],
        },
        usdc: { address: USDC, contracts: [{ label: 'usdctoken' }] },
        sparkusdcvault: {
          address: USDC_VAULT,
          contracts: [{ label: 'sparkusdcvault' }],
        },
      },
    );
    await multibaasSetup(done as unknown as Multibaas, () => undefined);
    expect(done.createContract).not.toHaveBeenCalled();
    expect(done.createAddress).not.toHaveBeenCalled();
    expect(done.linkContract).not.toHaveBeenCalled();
    const conflict = fake([], { weth: { address: USDC, contracts: [] } });
    await expect(
      multibaasSetup(conflict as unknown as Multibaas, () => undefined),
    ).rejects.toThrow('already points at');
  });
  it('reports every registration a run still needs', async () => {
    const legacy = fake([], {
      usdc: { address: USDC, contracts: [{ label: 'usdctoken' }] },
      sparkusdcvault: {
        address: USDC_VAULT,
        contracts: [{ label: 'sparkusdcvault' }],
      },
      weth: { address: USDC, contracts: [{ label: 'wethtoken' }] },
      clearstarethvault: { address: ETH_VAULT, contracts: [] },
    });
    expect(await missingRegistrations(legacy)).toEqual([
      'weth/wethtoken',
      'clearstarethvault/clearstarethvault',
    ]);
    const ready = fake([], {
      weth: {
        address: WETH.toLowerCase(),
        contracts: [{ label: 'wethtoken' }],
      },
      clearstarethvault: {
        address: ETH_VAULT,
        contracts: [{ label: 'clearstarethvault' }],
      },
      usdc: { address: USDC, contracts: [{ label: 'usdctoken' }] },
      sparkusdcvault: {
        address: USDC_VAULT,
        contracts: [{ label: 'sparkusdcvault' }],
      },
    });
    expect(await missingRegistrations(ready)).toEqual([]);
  });
});
