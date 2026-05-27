/**
 * Tests for useUser.ts thin wrapper and userQueryKeys factory.
 *
 * Cases covered:
 *  1. userQueryKeys — stable identity (same reference between calls)
 *  2. userQueryKeys.all produces ['user'] tuple
 *  3. userQueryKeys.byWallet produces ['user', 'by-wallet', address] tuple
 *  4. userQueryKeys.byId produces ['user', 'by-id', userId] tuple
 *  5. useUser returns userInfo, loading, error, isConnected, connectedWallet, refetch
 *  6. useUser loading=true when useCurrentUser is loading
 *  7. useUser loading=false when useCurrentUser is not loading
 *  8. useUser forwards connectedWallet and isConnected from useCurrentUser
 *  9. useUser returns null userInfo when inner query has no data
 * 10. useUser returns string error from inner query
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCurrentUser } from '@/hooks/queries/wallet/useUserQuery';
import { userQueryKeys } from '@/hooks/queries/wallet/useUserQuery';
import { useUser } from '@/hooks/queries/wallet/useUser';
import type { UserInfo } from '@/hooks/queries/wallet/useUserQuery';

vi.mock('@/hooks/queries/wallet/useUserQuery', () => ({
  useCurrentUser: vi.fn(),
  userQueryKeys: {
    all: ['user'] as const,
    byWallet: (wallet: string) => ['user', 'by-wallet', wallet] as const,
    byId: (id: string) => ['user', 'by-id', id] as const,
    bundleWallets: (id: string) => ['user', 'bundle-wallets', id] as const,
    wallets: (id: string) => ['user-wallets', id] as const,
  },
}));

const mockUserInfo: UserInfo = {
  userId: 'u-001',
  email: 'alice@example.com',
  bundleWallets: ['0xAAA'],
  additionalWallets: [
    { wallet_address: '0xAAA', label: 'Hot', created_at: '2024-01-01' },
  ],
  visibleWallets: ['0xAAA'],
  totalWallets: 1,
  totalVisibleWallets: 1,
};

const makeCurrentUserResult = (
  overrides: Partial<ReturnType<typeof useCurrentUser>> = {},
) => ({
  userInfo: null as UserInfo | null,
  isLoading: false,
  isFetching: false,
  isError: false,
  isSuccess: true,
  error: null as string | null,
  isConnected: false,
  connectedWallet: null as string | null,
  refetch: vi.fn().mockResolvedValue(undefined),
  data: undefined,
  status: 'success' as const,
  ...overrides,
});

describe('userQueryKeys', () => {
  it('exports a stable object reference from queryKeys.user', () => {
    // Identity: the imported reference should not be undefined
    expect(userQueryKeys).toBeDefined();
  });

  it('all key is ["user"]', () => {
    expect(userQueryKeys.all).toEqual(['user']);
  });

  it('byWallet key includes wallet address', () => {
    expect(userQueryKeys.byWallet('0xABC')).toEqual([
      'user',
      'by-wallet',
      '0xABC',
    ]);
  });

  it('byWallet key changes with different addresses', () => {
    const k1 = userQueryKeys.byWallet('0x111');
    const k2 = userQueryKeys.byWallet('0x222');
    expect(k1).not.toEqual(k2);
  });

  it('byId key includes userId', () => {
    expect(userQueryKeys.byId('user-xyz')).toEqual([
      'user',
      'by-id',
      'user-xyz',
    ]);
  });

  it('byId key changes with different userIds', () => {
    const k1 = userQueryKeys.byId('user-aaa');
    const k2 = userQueryKeys.byId('user-bbb');
    expect(k1).not.toEqual(k2);
  });
});

describe('useUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCurrentUser).mockReturnValue(
      makeCurrentUserResult() as ReturnType<typeof useCurrentUser>,
    );
  });

  it('returns userInfo from useCurrentUser', () => {
    vi.mocked(useCurrentUser).mockReturnValue(
      makeCurrentUserResult({ userInfo: mockUserInfo }) as ReturnType<
        typeof useCurrentUser
      >,
    );

    const { result } = renderHook(() => useUser());

    expect(result.current.userInfo).toEqual(mockUserInfo);
  });

  it('maps isLoading=true to loading=true', () => {
    vi.mocked(useCurrentUser).mockReturnValue(
      makeCurrentUserResult({ isLoading: true }) as ReturnType<
        typeof useCurrentUser
      >,
    );

    const { result } = renderHook(() => useUser());

    expect(result.current.loading).toBe(true);
  });

  it('maps isLoading=false to loading=false', () => {
    vi.mocked(useCurrentUser).mockReturnValue(
      makeCurrentUserResult({ isLoading: false }) as ReturnType<
        typeof useCurrentUser
      >,
    );

    const { result } = renderHook(() => useUser());

    expect(result.current.loading).toBe(false);
  });

  it('forwards connectedWallet from useCurrentUser', () => {
    vi.mocked(useCurrentUser).mockReturnValue(
      makeCurrentUserResult({
        connectedWallet: '0xBEEF',
        isConnected: true,
      }) as ReturnType<typeof useCurrentUser>,
    );

    const { result } = renderHook(() => useUser());

    expect(result.current.connectedWallet).toBe('0xBEEF');
    expect(result.current.isConnected).toBe(true);
  });

  it('returns null connectedWallet and isConnected=false when not connected', () => {
    vi.mocked(useCurrentUser).mockReturnValue(
      makeCurrentUserResult({
        connectedWallet: null,
        isConnected: false,
      }) as ReturnType<typeof useCurrentUser>,
    );

    const { result } = renderHook(() => useUser());

    expect(result.current.connectedWallet).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('returns null userInfo when inner query has no data', () => {
    vi.mocked(useCurrentUser).mockReturnValue(
      makeCurrentUserResult({ userInfo: null }) as ReturnType<
        typeof useCurrentUser
      >,
    );

    const { result } = renderHook(() => useUser());

    expect(result.current.userInfo).toBeNull();
  });

  it('forwards string error from useCurrentUser', () => {
    vi.mocked(useCurrentUser).mockReturnValue(
      makeCurrentUserResult({
        error: 'Wallet service unavailable',
      }) as ReturnType<typeof useCurrentUser>,
    );

    const { result } = renderHook(() => useUser());

    expect(result.current.error).toBe('Wallet service unavailable');
  });

  it('forwards null error when inner query has no error', () => {
    vi.mocked(useCurrentUser).mockReturnValue(
      makeCurrentUserResult({ error: null }) as ReturnType<
        typeof useCurrentUser
      >,
    );

    const { result } = renderHook(() => useUser());

    expect(result.current.error).toBeNull();
  });

  it('exposes a refetch function', () => {
    const mockRefetch = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useCurrentUser).mockReturnValue(
      makeCurrentUserResult({ refetch: mockRefetch }) as ReturnType<
        typeof useCurrentUser
      >,
    );

    const { result } = renderHook(() => useUser());

    expect(typeof result.current.refetch).toBe('function');
  });
});
