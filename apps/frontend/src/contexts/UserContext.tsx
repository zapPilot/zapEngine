import { createContext, type ReactNode, useCallback, useContext } from 'react';

import {
  useCurrentUser,
  type UserInfo,
} from '@/hooks/queries/wallet/useUserQuery';
import { logger } from '@/utils';

interface UserContextType {
  userInfo: UserInfo | null;
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  connectedWallet: string | null;
  refetch: () => Promise<unknown>;
  triggerRefetch: () => void;
}

const UserContext = createContext<UserContextType | null>(null);

interface UserProviderProps {
  children: ReactNode;
}

async function triggerUserRefetch(
  refetch: () => Promise<unknown>,
): Promise<void> {
  try {
    await refetch();
  } catch (error) {
    logger.error('Failed to refetch user data', error);
  }
}

export function UserProvider({ children }: UserProviderProps) {
  const {
    userInfo,
    isLoading: loading,
    error,
    isConnected,
    connectedWallet,
    refetch,
  } = useCurrentUser();

  const triggerRefetch = useCallback(() => {
    void triggerUserRefetch(refetch);
  }, [refetch]);

  const value: UserContextType = {
    userInfo,
    loading,
    error,
    isConnected,
    connectedWallet,
    refetch,
    triggerRefetch,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
