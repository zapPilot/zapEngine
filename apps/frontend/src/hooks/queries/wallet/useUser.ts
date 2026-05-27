import { useCurrentUser, type UserInfo } from './useUserQuery';

/**
 * Public shape exposed to feature code that needs current-user data.
 *
 * `loading` is the renamed `isLoading` field from React Query — kept for
 * caller compatibility.
 */
export interface UseUserResult {
  userInfo: UserInfo | null;
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  connectedWallet: string | null;
  refetch: () => Promise<unknown>;
}

/**
 * Thin wrapper over `useCurrentUser` that flattens the React-Query result
 * into the shape feature components expect.
 */
export function useUser(): UseUserResult {
  const { userInfo, isLoading, error, isConnected, connectedWallet, refetch } =
    useCurrentUser();

  return {
    userInfo,
    loading: isLoading,
    error,
    isConnected,
    connectedWallet,
    refetch,
  };
}
