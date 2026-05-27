import { vi } from 'vitest';

vi.mock('@/hooks/queries/wallet/useUser', () => {
  return {
    useUser: () => ({
      userInfo: null,
      loading: false,
      error: null,
      isConnected: false,
      connectedWallet: null,
      refetch: vi.fn(),
    }),
  };
});
