import { describe, expect, it, vi } from 'vitest';

// Mock viem before importing the SUT — `createPublicClient` is called at
// factory time, so we need the mock in place before the module loads.
vi.mock('viem', () => {
  return {
    createPublicClient: vi.fn((opts: { chain: { id: number } }) => ({
      __mock: true,
      chainId: opts.chain.id,
    })),
    http: vi.fn((url: string) => ({ __transport: true, url })),
  };
});

import { createPublicClient, http } from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';

import { createDepositPublicClients } from '../../../../src/modules/plan-orchestration/publicClients';
import type { ConfigService } from '../../../../src/config/config.service';

function makeConfig(values: Record<string, string> = {}): {
  get: Mock<ConfigService['get']>;
} {
  return {
    get: vi.fn((key: string) => values[key]) as unknown as Mock<
      ConfigService['get']
    >,
  };
}

type Mock<T> = ReturnType<typeof vi.fn> & T;

describe('createDepositPublicClients', () => {
  it('builds clients for mainnet, base, and arbitrum keyed by chain id', () => {
    const config = makeConfig();

    const factory = createDepositPublicClients(
      config as unknown as ConfigService,
    );
    const clients = factory();

    expect(Object.keys(clients).map(Number).sort((a, b) => a - b)).toEqual(
      [mainnet.id, base.id, arbitrum.id].sort((a, b) => a - b),
    );
  });

  it('falls back to public RPC URLs when no env keys are configured', () => {
    const config = makeConfig();

    createDepositPublicClients(config as unknown as ConfigService);

    // viem.http is called with each fallback URL.
    expect(http).toHaveBeenCalledWith('https://ethereum-rpc.publicnode.com');
    expect(http).toHaveBeenCalledWith('https://mainnet.base.org');
    expect(http).toHaveBeenCalledWith('https://arb1.arbitrum.io/rpc');
  });

  it('prefers RPC_URL_<CHAIN> over the legacy <CHAIN>_RPC_URL alias', () => {
    const config = makeConfig({
      RPC_URL_ETHEREUM: 'https://primary-eth',
      ETHEREUM_RPC_URL: 'https://legacy-eth',
    });

    createDepositPublicClients(config as unknown as ConfigService);

    expect(http).toHaveBeenCalledWith('https://primary-eth');
    expect(http).not.toHaveBeenCalledWith('https://legacy-eth');
  });

  it('falls back to legacy <CHAIN>_RPC_URL when primary key is unset', () => {
    const config = makeConfig({
      BASE_RPC_URL: 'https://legacy-base',
    });

    createDepositPublicClients(config as unknown as ConfigService);

    expect(http).toHaveBeenCalledWith('https://legacy-base');
  });

  it('passes the correct viem chain object to createPublicClient per slot', () => {
    const config = makeConfig();

    createDepositPublicClients(config as unknown as ConfigService);

    const calls = (createPublicClient as unknown as ReturnType<typeof vi.fn>)
      .mock.calls as Array<[{ chain: { id: number } }]>;
    const chainIds = calls.map(([opts]) => opts.chain.id);
    expect(chainIds).toContain(mainnet.id);
    expect(chainIds).toContain(base.id);
    expect(chainIds).toContain(arbitrum.id);
  });

  it('returns a factory whose subsequent calls return the same client set (memoized)', () => {
    const config = makeConfig();
    const factory = createDepositPublicClients(
      config as unknown as ConfigService,
    );
    expect(factory()).toBe(factory());
  });
});
