import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createConfig: vi.fn((config: unknown) => config),
  http: vi.fn((url: string) => ({ url })),
  injected: vi.fn(() => ({ type: 'injected' })),
  walletConnect: vi.fn((options: unknown) => ({
    type: 'walletConnect',
    options,
  })),
  getWalletConnectProjectId: vi.fn<() => string | undefined>(),
}));

vi.mock('wagmi', () => ({
  createConfig: mocks.createConfig,
  http: mocks.http,
}));
vi.mock('wagmi/connectors/injected', () => ({ injected: mocks.injected }));
vi.mock('wagmi/connectors/walletConnect', () => ({
  walletConnect: mocks.walletConnect,
}));
vi.mock('@core/lib/env/walletConnect', () => ({
  getWalletConnectProjectId: mocks.getWalletConnectProjectId,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('getWagmiConfig', () => {
  it('includes only injected() when no WalletConnect project id is configured, without throwing', async () => {
    mocks.getWalletConnectProjectId.mockReturnValue(undefined);
    const { getWagmiConfig } = await import('@core/config/wagmi');

    expect(() => getWagmiConfig()).not.toThrow();
    expect(mocks.injected).toHaveBeenCalledTimes(1);
    expect(mocks.walletConnect).not.toHaveBeenCalled();
  });

  it('adds walletConnect() with showQrModal when a project id is configured', async () => {
    mocks.getWalletConnectProjectId.mockReturnValue('test-project-id');
    const { getWagmiConfig } = await import('@core/config/wagmi');

    getWagmiConfig();

    expect(mocks.walletConnect).toHaveBeenCalledWith({
      projectId: 'test-project-id',
      showQrModal: true,
    });
  });

  it('configures arbitrum/base/optimism chains, ssr, and multi-injected discovery', async () => {
    mocks.getWalletConnectProjectId.mockReturnValue(undefined);
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
    mocks.getWalletConnectProjectId.mockReturnValue(undefined);
    const { getWagmiConfig } = await import('@core/config/wagmi');

    const first = getWagmiConfig();
    const second = getWagmiConfig();

    expect(first).toBe(second);
    expect(mocks.createConfig).toHaveBeenCalledTimes(1);
  });
});
