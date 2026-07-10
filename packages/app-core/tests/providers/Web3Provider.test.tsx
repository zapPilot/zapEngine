import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWagmiConfig: vi.fn(() => ({ id: 'stub-wagmi-config' })),
}));

vi.mock('wagmi', () => ({
  WagmiProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@core/config/wagmi', () => ({ getWagmiConfig: mocks.getWagmiConfig }));

describe('Web3Provider', () => {
  it('renders its children inside WagmiProvider using the shared wagmi config', async () => {
    const { Web3Provider } = await import('@core/providers/Web3Provider');
    const html = renderToString(
      <Web3Provider>
        <span>wagmi ready</span>
      </Web3Provider>,
    );
    expect(html).toContain('wagmi ready');
    expect(mocks.getWagmiConfig).toHaveBeenCalled();
  });
});
