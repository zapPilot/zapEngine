import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BundlePageClient } from '@/app/bundle/BundlePageClient';

import { render } from '../../../test-utils';

// Mock lightweight child components to avoid heavy hooks
vi.mock('@/components/Navigation', () => ({
  Navigation: () => null,
}));

vi.mock('@/components/wallet/portfolio/WalletPortfolio', () => ({
  WalletPortfolio: () => <div data-testid="wallet-portfolio" />,
}));

vi.mock('@/components/wallet/portfolio/DashboardShell', () => ({
  DashboardShell: () => <div data-testid="dashboard-shell" />,
}));

vi.mock('@/components/WalletManager', () => ({
  WalletManager: () => null,
}));

// Router mock
const replaceMock = vi.fn();
const pathnameMock = vi.fn().mockReturnValue('/');
const searchParamsMock = vi.fn().mockReturnValue(new URLSearchParams());

vi.mock('@/lib/routing', () => {
  return {
    useAppRouter: () => ({ replace: replaceMock }),
    useAppPathname: () => pathnameMock(),
    useAppSearchParams: () => searchParamsMock(),
  };
});

// User context mock (we'll override return values per test)
let mockIsConnected = false;
let mockUserId: string | null = null;
let mockLoading = false;
let mockConnectedWallet: string | null = null;

vi.mock('@/contexts/UserContext', () => ({
  useUser: () => ({
    userInfo: mockUserId ? { userId: mockUserId } : null,
    isConnected: mockIsConnected,
    loading: mockLoading,
    error: null,
    connectedWallet: mockConnectedWallet,
    refetch: vi.fn(),
    triggerRefetch: vi.fn(),
  }),
}));

describe('BundlePageClient - Wallet Connection Redirect', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pathnameMock.mockReturnValue('/');
    searchParamsMock.mockReturnValue(new URLSearchParams());
    mockIsConnected = false;
    mockUserId = null;
    mockLoading = false;
    mockConnectedWallet = null;
  });

  describe('successful redirect scenarios', () => {
    it('should redirect to bundle page after wallet connection completes', async () => {
      // Start on home page
      pathnameMock.mockReturnValue('/');
      window.history.pushState({}, '', '/');

      // Wallet is connected and user data is loaded
      mockIsConnected = true;
      mockUserId = '0x1234567890abcdef';
      mockConnectedWallet = '0x1234567890abcdef';
      mockLoading = false;

      await act(async () => {
        render(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      // Should redirect to bundle page with userId parameter
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith(
          '/bundle?userId=0x1234567890abcdef',
        );
      });
      // May be called multiple times in dev mode due to React Strict Mode
      expect(replaceMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should preserve existing query parameters during redirect', async () => {
      // Start on home page with existing query params
      searchParamsMock.mockReturnValue(new URLSearchParams('referral=abc123'));

      mockIsConnected = true;
      mockUserId = '0xUSER123';
      mockLoading = false;

      await act(async () => {
        render(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      // Should preserve referral param and add userId
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith(
          '/bundle?referral=abc123&userId=0xUSER123',
        );
      });
    });

    it('should preserve portfolio deep-link parameters during redirect', async () => {
      searchParamsMock.mockReturnValue(
        new URLSearchParams(
          'tab=invest&invest=market&market=relative-strength',
        ),
      );

      mockIsConnected = true;
      mockUserId = '0xUSER123';
      mockLoading = false;

      await act(async () => {
        render(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith(
          '/bundle?tab=invest&invest=market&market=relative-strength&userId=0xUSER123',
        );
      });
    });
  });

  describe('no redirect scenarios - loading states', () => {
    it('should NOT redirect while user data is loading', async () => {
      window.history.pushState({}, '', '/');

      // Wallet connected but data still loading
      mockIsConnected = true;
      mockUserId = null; // Not loaded yet
      mockLoading = true; // Still loading
      mockConnectedWallet = '0xABC';

      await act(async () => {
        render(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      // Should not redirect while loading
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('should NOT redirect if userInfo.userId is not available', async () => {
      window.history.pushState({}, '', '/');

      // Connected but no userId (edge case - query failed or returned null)
      mockIsConnected = true;
      mockUserId = null;
      mockLoading = false;
      mockConnectedWallet = '0xABC';

      await act(async () => {
        render(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  describe('no redirect scenarios - already on bundle page', () => {
    it('should NOT redirect if userId prop is already provided', async () => {
      window.history.pushState({}, '', '/bundle?userId=0xOTHER');

      // Connected with different userId
      mockIsConnected = true;
      mockUserId = '0xMYWALLET';
      mockLoading = false;

      await act(async () => {
        // userId prop is provided (viewing someone's bundle)
        render(<BundlePageClient userId="0xOTHER" />);
        await Promise.resolve();
      });

      // Should not redirect (already on a bundle page)
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('should NOT redirect if viewing own bundle', async () => {
      window.history.pushState({}, '', '/bundle?userId=0xMYWALLET');

      // Viewing own bundle
      mockIsConnected = true;
      mockUserId = '0xMYWALLET';
      mockLoading = false;

      await act(async () => {
        render(<BundlePageClient userId="0xMYWALLET" />);
        await Promise.resolve();
      });

      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  describe('no redirect scenarios - disconnected state', () => {
    it('should NOT redirect when wallet is disconnected', async () => {
      window.history.pushState({}, '', '/');

      // Not connected
      mockIsConnected = false;
      mockUserId = null;
      mockLoading = false;

      await act(async () => {
        render(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  describe('no redirect scenarios - wrong pathname', () => {
    it('should NOT redirect if not on home page', async () => {
      // On some other page
      pathnameMock.mockReturnValue('/about');
      window.history.pushState({}, '', '/about');

      mockIsConnected = true;
      mockUserId = '0xABC123';
      mockLoading = false;

      await act(async () => {
        render(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      // Should not redirect (pathname !== "/")
      expect(replaceMock).not.toHaveBeenCalled();
    });

    it('should NOT redirect if on /bundle route without userId', async () => {
      pathnameMock.mockReturnValue('/bundle');
      window.history.pushState({}, '', '/bundle');

      mockIsConnected = true;
      mockUserId = '0xABC123';
      mockLoading = false;

      await act(async () => {
        render(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      // Should not redirect (pathname is "/bundle", not "/")
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle userId with special characters', async () => {
      window.history.pushState({}, '', '/');

      mockIsConnected = true;
      mockUserId = '0xABCDEF+special%20chars';
      mockLoading = false;

      await act(async () => {
        render(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      // URLSearchParams should properly encode special characters
      const userId = '0xABCDEF+special%20chars';
      const expectedUrl = `/bundle?userId=${encodeURIComponent(userId)}`;
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith(expectedUrl);
      });
    });

    it('should handle multiple query parameters correctly', async () => {
      searchParamsMock.mockReturnValue(new URLSearchParams('foo=bar&baz=qux'));

      mockIsConnected = true;
      mockUserId = '0xUSER';
      mockLoading = false;

      await act(async () => {
        render(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      // Should preserve all existing params
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalled();
      });
      const call = replaceMock.mock.calls[0][0];
      expect(call).toContain('foo=bar');
      expect(call).toContain('baz=qux');
      expect(call).toContain('userId=0xUSER');
    });
  });

  describe('redirect timing - loading state transitions', () => {
    it('should redirect when loading changes from true to false', async () => {
      window.history.pushState({}, '', '/');

      // Initial state: loading
      mockIsConnected = true;
      mockUserId = null;
      mockLoading = true;

      const { rerender } = await act(async () => {
        const result = render(<BundlePageClient userId="" />);
        await Promise.resolve();
        return result;
      });

      // Should not redirect yet
      expect(replaceMock).not.toHaveBeenCalled();

      // Update state: loading completes
      mockUserId = '0xNEWUSER';
      mockLoading = false;

      await act(async () => {
        rerender(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      // Should redirect after loading completes
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith('/bundle?userId=0xNEWUSER');
      });
    });

    it('should redirect when userId becomes available while connected', async () => {
      window.history.pushState({}, '', '/');

      // Initial state: connected but no userId yet
      mockIsConnected = true;
      mockUserId = null;
      mockLoading = false;

      const { rerender } = await act(async () => {
        const result = render(<BundlePageClient userId="" />);
        await Promise.resolve();
        return result;
      });

      expect(replaceMock).not.toHaveBeenCalled();

      // UserId becomes available
      mockUserId = '0xNEWUSER';

      await act(async () => {
        rerender(<BundlePageClient userId="" />);
        await Promise.resolve();
      });

      // Should redirect when userId is available
      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith('/bundle?userId=0xNEWUSER');
      });
    });
  });
});
