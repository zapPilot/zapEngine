import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPrivyAppId: vi.fn(() => 'test-privy-app-id'),
  PrivyProvider: vi.fn(({ children }: { children: ReactNode }) => children),
}));

vi.mock('@privy-io/react-auth', () => ({
  PrivyProvider: mocks.PrivyProvider,
}));
vi.mock('@core/lib/env/privy', () => ({
  getPrivyAppId: mocks.getPrivyAppId,
}));

describe('PrivyAuthProvider', () => {
  it('disables Privy external wallets while retaining embedded-wallet login methods', async () => {
    const { PrivyAuthProvider } =
      await import('@core/providers/PrivyAuthProvider');

    renderToString(
      <PrivyAuthProvider>
        <span>Privy ready</span>
      </PrivyAuthProvider>,
    );

    expect(mocks.PrivyProvider).toHaveBeenCalledTimes(1);
    const [{ appId, config }] = mocks.PrivyProvider.mock.calls[0] as [
      {
        appId: string;
        config: {
          externalWallets?: { disableAllExternalWallets?: boolean };
          loginMethods?: string[];
        };
      },
    ];
    expect(appId).toBe('test-privy-app-id');
    expect(config.externalWallets?.disableAllExternalWallets).toBe(true);
    expect(config.loginMethods).not.toContain('wallet');
  });
});
