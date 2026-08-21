import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createConfig: vi.fn((config: unknown) => config),
  http: vi.fn((url: string) => ({ url })),
  injected: vi.fn(() => ({ type: 'injected' })),
}));

vi.mock('wagmi', () => ({
  createConfig: mocks.createConfig,
  http: mocks.http,
}));
vi.mock('wagmi/connectors/injected', () => ({ injected: mocks.injected }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('getWagmiConfig', () => {
  it('configures only the injected() connector — no WalletConnect (its eager init fires AppKit telemetry)', async () => {
    const { getWagmiConfig } = await import('@core/config/wagmi');

    getWagmiConfig();

    expect(mocks.injected).toHaveBeenCalledTimes(1);
    const [config] = mocks.createConfig.mock.calls[0] as [
      { connectors: { type: string }[] },
    ];
    expect(config.connectors).toEqual([{ type: 'injected' }]);
  });

  it('configures arbitrum/base/optimism chains, ssr, and multi-injected discovery', async () => {
    const { getWagmiConfig } = await import('@core/config/wagmi');

    getWagmiConfig();

    expect(mocks.createConfig).toHaveBeenCalledTimes(1);
    const [config] = mocks.createConfig.mock.calls[0] as [
      {
        chains: { id: number }[];
        ssr: boolean;
        multiInjectedProviderDiscovery: boolean;
        transports: Record<number, unknown>;
      },
    ];
    expect(config.chains.map((chain) => chain.id)).toEqual([42161, 8453, 10]);
    expect(config.ssr).toBe(true);
    expect(config.multiInjectedProviderDiscovery).toBe(true);
    // Object.keys on numeric keys is always ascending, regardless of
    // insertion order — compare as a set, not a sequence.
    expect(new Set(Object.keys(config.transports).map(Number))).toEqual(
      new Set([42161, 8453, 10]),
    );
  });

  it('memoizes the config across calls (single createConfig invocation)', async () => {
    const { getWagmiConfig } = await import('@core/config/wagmi');

    const first = getWagmiConfig();
    const second = getWagmiConfig();

    expect(first).toBe(second);
    expect(mocks.createConfig).toHaveBeenCalledTimes(1);
  });
});
