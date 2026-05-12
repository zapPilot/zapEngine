import type { ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('@/contexts/UserContext', () => {
  return {
    useUser: () => ({
      userInfo: null,
      loading: false,
      error: null,
      isConnected: false,
      connectedWallet: null,
      refetch: vi.fn(),
    }),
    UserProvider: ({ children }: { children: ReactNode }) => children,
  };
});
