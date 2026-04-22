/**
 * Unit tests for useUserQuery hooks — branch coverage focus
 *
 * Covers the 7 uncovered branches not exercised by useUserQuery.test.tsx:
 *
 *  1. queryFn guard in useUserByWallet: throws when walletAddress is falsy
 *     (enabled=false prevents real execution, but the branch must be covered)
 *  2. queryFn guard in useUserById: throws when userId is falsy
 *  3. buildUserInfo: profileData.wallets is null/undefined → falls back to []
 *  4. buildUserInfo: profileData.user?.email is undefined → falls back to ""
 *  5. buildUserInfo: wallets empty AND no fallbackWallet → bundleWallets stays []
 *  6. buildUserInfo: isNewUser is truthy → spread { isNewUser } into result
 *  7. buildUserInfo: etlJobId is truthy → spread { etlJobId } into result
 *
 * Strategy: mock useQuery so we can invoke the captured queryFn directly,
 * bypassing the enabled guard and exercising the internal logic branches.
 */
import { useQuery } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccount } from 'wagmi';

import {
  useCurrentUser,
  useUserById,
  useUserByWallet,
} from '@/hooks/queries/wallet/useUserQuery';
import { useWalletProvider } from '@/providers/WalletProvider';
import { connectWallet, getUserProfile } from '@/services/accountService';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return { ...actual, useQuery: vi.fn() };
});

vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
}));

vi.mock('@/providers/WalletProvider', () => ({
  useWalletProvider: vi.fn(),
}));

vi.mock('@/services/accountService', () => ({
  connectWallet: vi.fn(),
  getUserProfile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture the queryFn that the hook registers with useQuery. */
function captureQueryFn(): {
  fn: ((...args: unknown[]) => Promise<unknown>) | null;
} {
  const captured: { fn: ((...args: unknown[]) => Promise<unknown>) | null } = {
    fn: null,
  };

  vi.mocked(useQuery).mockImplementation(
    (options: Parameters<typeof useQuery>[0]) => {
      captured.fn = options.queryFn as (...args: unknown[]) => Promise<unknown>;
      return {
        data: undefined,
        isLoading: false,
        isFetching: false,
        isError: false,
        isSuccess: false,
        error: null,
        refetch: vi.fn(),
        status: 'pending',
      } as ReturnType<typeof useQuery>;
    },
  );

  return captured;
}

/** Minimal happy-path connect-wallet response without ETL job. */
const baseConnectResponse = {
  user_id: 'user-abc',
  is_new_user: false,
  etl_job: undefined,
};

/** Minimal user profile with two wallets. */
const profileWithWallets = {
  user: {
    id: 'user-abc',
    email: 'alice@example.com',
    is_subscribed_to_reports: false,
    created_at: '2024-01-01',
  },
  wallets: [
    {
      id: 'w1',
      user_id: 'user-abc',
      wallet: '0xAAA',
      label: 'Hot',
      created_at: '2024-01-01',
    },
    {
      id: 'w2',
      user_id: 'user-abc',
      wallet: '0xBBB',
      label: null,
      created_at: '2024-01-02',
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useUserQuery — uncovered branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default stub — overridden per test
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      isSuccess: false,
      error: null,
      refetch: vi.fn(),
      status: 'pending',
    } as ReturnType<typeof useQuery>);

    vi.mocked(useAccount).mockReturnValue({
      address: undefined,
    } as ReturnType<typeof useAccount>);
    vi.mocked(connectWallet).mockResolvedValue(
      baseConnectResponse as ReturnType<typeof connectWallet> extends Promise<
        infer T
      >
        ? T
        : never,
    );
    vi.mocked(getUserProfile).mockResolvedValue(
      profileWithWallets as ReturnType<typeof getUserProfile> extends Promise<
        infer T
      >
        ? T
        : never,
    );
  });

  // -------------------------------------------------------------------------
  // Branch 1: useUserByWallet queryFn guard — walletAddress is falsy
  // -------------------------------------------------------------------------
  describe('useUserByWallet queryFn', () => {
    it('throws when walletAddress is empty string (falsy guard inside queryFn)', async () => {
      const captured = captureQueryFn();

      renderHook(() => useUserByWallet(null));

      // The hook passes "" as the key when walletAddress is null, and the
      // queryFn contains an explicit guard for the falsy case.
      // We invoke it directly to exercise the unreachable-at-runtime branch.
      expect(captured.fn).not.toBeNull();
      await expect(captured.fn!()).rejects.toThrow(
        'No wallet address provided',
      );
    });

    it('returns UserInfo with isNewUser when connectWallet reports a new user', async () => {
      vi.mocked(connectWallet).mockResolvedValue({
        ...baseConnectResponse,
        is_new_user: true,
        etl_job: undefined,
      } as ReturnType<typeof connectWallet> extends Promise<infer T>
        ? T
        : never);
      vi.mocked(getUserProfile).mockResolvedValue(
        profileWithWallets as ReturnType<typeof getUserProfile> extends Promise<
          infer T
        >
          ? T
          : never,
      );

      const captured = captureQueryFn();
      renderHook(() => useUserByWallet('0xAAA'));

      const result = await captured.fn!();
      expect(result).toMatchObject({ isNewUser: true });
    });

    it('sets etlJobId on result when connectWallet returns an etl_job', async () => {
      vi.mocked(connectWallet).mockResolvedValue({
        ...baseConnectResponse,
        etl_job: {
          job_id: 'job-xyz',
          status: 'pending' as const,
        },
      } as ReturnType<typeof connectWallet> extends Promise<infer T>
        ? T
        : never);
      vi.mocked(getUserProfile).mockResolvedValue(
        profileWithWallets as ReturnType<typeof getUserProfile> extends Promise<
          infer T
        >
          ? T
          : never,
      );

      const captured = captureQueryFn();
      renderHook(() => useUserByWallet('0xAAA'));

      const result = await captured.fn!();
      expect(result).toMatchObject({ etlJobId: 'job-xyz' });
    });

    it('does NOT include isNewUser key when is_new_user is false', async () => {
      vi.mocked(connectWallet).mockResolvedValue({
        ...baseConnectResponse,
        is_new_user: false,
        etl_job: undefined,
      } as ReturnType<typeof connectWallet> extends Promise<infer T>
        ? T
        : never);
      vi.mocked(getUserProfile).mockResolvedValue(
        profileWithWallets as ReturnType<typeof getUserProfile> extends Promise<
          infer T
        >
          ? T
          : never,
      );

      const captured = captureQueryFn();
      renderHook(() => useUserByWallet('0xAAA'));

      const result = (await captured.fn!()) as Record<string, unknown>;
      expect(result).not.toHaveProperty('isNewUser');
    });

    it('does NOT include etlJobId key when etl_job is absent', async () => {
      vi.mocked(connectWallet).mockResolvedValue({
        ...baseConnectResponse,
        etl_job: undefined,
      } as ReturnType<typeof connectWallet> extends Promise<infer T>
        ? T
        : never);
      vi.mocked(getUserProfile).mockResolvedValue(
        profileWithWallets as ReturnType<typeof getUserProfile> extends Promise<
          infer T
        >
          ? T
          : never,
      );

      const captured = captureQueryFn();
      renderHook(() => useUserByWallet('0xAAA'));

      const result = (await captured.fn!()) as Record<string, unknown>;
      expect(result).not.toHaveProperty('etlJobId');
    });

    it('uses fallbackWallet when profileData has no wallets', async () => {
      vi.mocked(getUserProfile).mockResolvedValue({
        user: profileWithWallets.user,
        wallets: [],
      } as ReturnType<typeof getUserProfile> extends Promise<infer T>
        ? T
        : never);

      const captured = captureQueryFn();
      renderHook(() => useUserByWallet('0xFALLBACK'));

      const result = (await captured.fn!()) as Record<string, unknown>;
      expect(result).toMatchObject({
        bundleWallets: ['0xFALLBACK'],
        totalWallets: 1,
      });
    });

    it('falls back to empty email string when profileData.user.email is absent', async () => {
      vi.mocked(getUserProfile).mockResolvedValue({
        user: {
          id: 'user-abc',
          // email intentionally omitted
          is_subscribed_to_reports: false,
          created_at: '2024-01-01',
        },
        wallets: profileWithWallets.wallets,
      } as ReturnType<typeof getUserProfile> extends Promise<infer T>
        ? T
        : never);

      const captured = captureQueryFn();
      renderHook(() => useUserByWallet('0xAAA'));

      const result = (await captured.fn!()) as Record<string, unknown>;
      expect(result).toMatchObject({ email: '' });
    });

    it('falls back to empty wallets array when profileData.wallets is null/undefined', async () => {
      vi.mocked(getUserProfile).mockResolvedValue({
        user: profileWithWallets.user,
        // wallets intentionally absent — exercises the `|| []` branch
        wallets: undefined,
      } as unknown as ReturnType<typeof getUserProfile> extends Promise<infer T>
        ? T
        : never);

      const captured = captureQueryFn();
      renderHook(() => useUserByWallet('0xAAA'));

      // Should not throw; falls back to fallbackWallet ("0xAAA")
      const result = (await captured.fn!()) as Record<string, unknown>;
      expect(Array.isArray(result['bundleWallets'])).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Branch 2: useUserById queryFn guard — userId is falsy
  // -------------------------------------------------------------------------
  describe('useUserById queryFn', () => {
    it('throws when userId is empty string (falsy guard inside queryFn)', async () => {
      const captured = captureQueryFn();

      renderHook(() => useUserById(null));

      expect(captured.fn).not.toBeNull();
      await expect(captured.fn!()).rejects.toThrow('No user ID provided');
    });

    it('returns UserInfo without isNewUser or etlJobId (no wallet connection)', async () => {
      vi.mocked(getUserProfile).mockResolvedValue(
        profileWithWallets as ReturnType<typeof getUserProfile> extends Promise<
          infer T
        >
          ? T
          : never,
      );

      const captured = captureQueryFn();
      renderHook(() => useUserById('bundle-owner-999'));

      const result = (await captured.fn!()) as Record<string, unknown>;
      expect(result).not.toHaveProperty('isNewUser');
      expect(result).not.toHaveProperty('etlJobId');
      expect(result).toMatchObject({
        userId: 'bundle-owner-999',
        email: 'alice@example.com',
        bundleWallets: ['0xAAA', '0xBBB'],
      });
    });

    it('produces empty bundleWallets when profile has no wallets and no fallback', async () => {
      vi.mocked(getUserProfile).mockResolvedValue({
        user: profileWithWallets.user,
        wallets: [],
      } as ReturnType<typeof getUserProfile> extends Promise<infer T>
        ? T
        : never);

      const captured = captureQueryFn();
      renderHook(() => useUserById('bundle-owner-999'));

      const result = (await captured.fn!()) as Record<string, unknown>;
      // No fallbackWallet passed → bundleWallets must be []
      expect(result).toMatchObject({
        bundleWallets: [],
        totalWallets: 0,
        totalVisibleWallets: 0,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Branch 3 & 4 (consolidated): buildUserInfo edge cases via useUserById
  // -------------------------------------------------------------------------
  describe('buildUserInfo edge cases via useUserById', () => {
    it('maps null wallet label to null in additionalWallets', async () => {
      vi.mocked(getUserProfile).mockResolvedValue({
        user: profileWithWallets.user,
        wallets: [
          {
            id: 'w1',
            user_id: 'u',
            wallet: '0xNULL',
            label: null,
            created_at: '2024-06-01',
          },
        ],
      } as ReturnType<typeof getUserProfile> extends Promise<infer T>
        ? T
        : never);

      const captured = captureQueryFn();
      renderHook(() => useUserById('uid-null-label'));

      const result = (await captured.fn!()) as {
        additionalWallets: { label: unknown }[];
      };
      expect(result.additionalWallets[0]?.label).toBeNull();
    });

    it('maps undefined wallet label to null in additionalWallets', async () => {
      vi.mocked(getUserProfile).mockResolvedValue({
        user: profileWithWallets.user,
        wallets: [
          {
            id: 'w1',
            user_id: 'u',
            wallet: '0xUNDEF',
            label: undefined,
            created_at: '2024-06-01',
          },
        ],
      } as ReturnType<typeof getUserProfile> extends Promise<infer T>
        ? T
        : never);

      const captured = captureQueryFn();
      renderHook(() => useUserById('uid-undef-label'));

      const result = (await captured.fn!()) as {
        additionalWallets: { label: unknown }[];
      };
      // label ?? null → null when label is undefined
      expect(result.additionalWallets[0]?.label).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // useCurrentUser: error message transformation
  // -------------------------------------------------------------------------
  describe('useCurrentUser', () => {
    it('exposes error as a string message when the inner query errors', () => {
      const testError = new Error('Wallet service unavailable');

      vi.mocked(useWalletProvider).mockReturnValue({
        account: { address: '0xDEAD', isConnected: true },
      } as ReturnType<typeof useWalletProvider>);
      vi.mocked(useQuery).mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
        error: testError,
        refetch: vi.fn(),
        status: 'error',
      } as ReturnType<typeof useQuery>);

      const { result } = renderHook(() => useCurrentUser());

      expect(result.current.error).toBe('Wallet service unavailable');
      expect(result.current.isConnected).toBe(true);
    });

    it('exposes error as null when the inner query has no error', () => {
      vi.mocked(useWalletProvider).mockReturnValue({
        account: null,
      } as ReturnType<typeof useWalletProvider>);
      vi.mocked(useQuery).mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        isError: false,
        isSuccess: false,
        error: null,
        refetch: vi.fn(),
        status: 'pending',
      } as ReturnType<typeof useQuery>);

      const { result } = renderHook(() => useCurrentUser());

      expect(result.current.error).toBeNull();
      expect(result.current.isConnected).toBe(false);
    });

    it('derives connectedWallet from wallet provider account', () => {
      vi.mocked(useWalletProvider).mockReturnValue({
        account: { address: '0xBEEF', isConnected: true },
      } as ReturnType<typeof useWalletProvider>);

      const { result } = renderHook(() => useCurrentUser());

      expect(result.current.connectedWallet).toBe('0xBEEF');
      expect(result.current.isConnected).toBe(true);
    });

    it('sets connectedWallet to null when wallet provider has no account', () => {
      vi.mocked(useWalletProvider).mockReturnValue({
        account: null,
      } as ReturnType<typeof useWalletProvider>);

      const { result } = renderHook(() => useCurrentUser());

      expect(result.current.connectedWallet).toBeNull();
      expect(result.current.isConnected).toBe(false);
    });

    it('sets userInfo to null when query has no data', () => {
      vi.mocked(useWalletProvider).mockReturnValue({
        account: { address: '0xBEEF', isConnected: true },
      } as ReturnType<typeof useWalletProvider>);
      vi.mocked(useQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
        isFetching: true,
        isError: false,
        isSuccess: false,
        error: null,
        refetch: vi.fn(),
        status: 'pending',
      } as ReturnType<typeof useQuery>);

      const { result } = renderHook(() => useCurrentUser());

      expect(result.current.userInfo).toBeNull();
    });
  });
});
