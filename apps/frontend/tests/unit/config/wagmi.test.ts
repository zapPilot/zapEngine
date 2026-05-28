import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDefaultConfig = vi.hoisted(() =>
  vi.fn((config: unknown) => ({ kind: 'rainbowkit-config', config })),
);
const mockGetRuntimeEnv = vi.hoisted(() => vi.fn());
const mockHttp = vi.hoisted(() => vi.fn((url: string) => ({ url })));

const mockArbitrum = { id: 42161, name: 'Arbitrum' };
const mockBase = { id: 8453, name: 'Base' };
const mockOptimism = { id: 10, name: 'Optimism' };

vi.mock('@rainbow-me/rainbowkit', () => ({
  getDefaultConfig: mockGetDefaultConfig,
}));

vi.mock('wagmi', () => ({
  http: mockHttp,
}));

vi.mock('wagmi/chains', () => ({
  arbitrum: mockArbitrum,
  base: mockBase,
  optimism: mockOptimism,
}));

vi.mock('@/lib/env/runtimeEnv', () => ({
  getRuntimeEnv: mockGetRuntimeEnv,
}));

describe('wagmiConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetDefaultConfig.mockClear();
    mockGetRuntimeEnv.mockReset();
    mockHttp.mockClear();
  });

  it('builds RainbowKit config with the required WalletConnect project id', async () => {
    mockGetRuntimeEnv.mockReturnValue('walletconnect-project-id');

    const { wagmiConfig } = await import('@/config/wagmi');

    expect(mockGetRuntimeEnv).toHaveBeenCalledWith(
      'VITE_WALLETCONNECT_PROJECT_ID',
    );
    expect(mockGetDefaultConfig).toHaveBeenCalledWith({
      appName: 'Zap Pilot',
      projectId: 'walletconnect-project-id',
      ssr: true,
      chains: [mockArbitrum, mockBase, mockOptimism],
      transports: {
        [mockArbitrum.id]: { url: 'https://arb1.arbitrum.io/rpc' },
        [mockBase.id]: { url: 'https://mainnet.base.org' },
        [mockOptimism.id]: { url: 'https://mainnet.optimism.io' },
      },
    });
    expect(wagmiConfig).toEqual({
      kind: 'rainbowkit-config',
      config: expect.objectContaining({
        projectId: 'walletconnect-project-id',
      }),
    });
  });

  it('fails clearly when WalletConnect project id is missing', async () => {
    mockGetRuntimeEnv.mockReturnValue(undefined);

    await expect(import('@/config/wagmi')).rejects.toThrow(
      'Missing required VITE_WALLETCONNECT_PROJECT_ID',
    );
    expect(mockGetDefaultConfig).not.toHaveBeenCalled();
  });
});
