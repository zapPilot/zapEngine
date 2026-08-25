// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticatedActionProvider } from '@/providers/AuthenticatedActionProvider';
import { AccountScreen } from '@/screens/AccountScreen';

const mocks = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  getUserByWallet: vi.fn(),
  getUserProfile: vi.fn(),
  deleteUser: vi.fn(),
  requestAccountDeletionChallenge: vi.fn(),
  wallet: {
    account: null as { address: string } | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    signMessage: vi.fn(),
    error: null as { message: string } | null,
    isConnected: false,
    isConnecting: false,
  },
}));

vi.mock('@zapengine/app-core/services/accountService', () => ({
  connectWallet: mocks.connectWallet,
  getUserByWallet: mocks.getUserByWallet,
  getUserProfile: mocks.getUserProfile,
  deleteUser: mocks.deleteUser,
  requestAccountDeletionChallenge: mocks.requestAccountDeletionChallenge,
}));

vi.mock('@zapengine/app-core/providers/walletContext', () => ({
  useWalletProvider: () => mocks.wallet,
}));

vi.mock('react-native', () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('lucide-react-native', () => ({
  Bell: () => null,
  ChevronRight: () => null,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('expo-linking', () => ({
  openURL: vi.fn(),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/PrimaryButton', () => ({
  PrimaryButton: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    onPress,
  }: {
    children?: ReactNode;
    onPress?: () => void;
  }) => (
    <button onClick={onPress} type="button">
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title }: { title?: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/ui/ScreenScrollView', () => ({
  ScreenScrollView: ({ children }: { children?: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('@/components/ui/NonCustodialCard', () => ({
  NonCustodialCard: () => null,
}));
vi.mock('@/components/account/LanguageSettingsCard', () => ({
  LanguageSettingsCard: () => null,
}));

vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock('@/integration/useTelegramConnection', () => ({
  useTelegramConnection: () => ({
    enabled: true,
    isDisconnecting: false,
    view: { kind: 'loading' as const },
    connect: vi.fn(),
    disconnect: vi.fn(),
    retry: vi.fn(),
  }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const USER_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';

async function settleUntil(check: () => void): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 400; i += 1) {
      try {
        check();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    check();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.wallet.account = { address: '0xaaa' };
  mocks.wallet.isConnected = true;
  mocks.wallet.isConnecting = false;
  mocks.wallet.error = null;
  mocks.connectWallet.mockResolvedValue({
    user_id: USER_ID,
    is_new_user: false,
  });
  mocks.getUserByWallet.mockResolvedValue({ user_id: USER_ID });
  mocks.getUserProfile.mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'user@example.com',
      is_subscribed_to_reports: false,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    wallets: [],
  });
});

describe('account bootstrap single-flight (production topology)', () => {
  it('mounts AuthenticatedActionProvider + AccountScreen + TelegramCard + DeleteAccountCard with exactly one connect-wallet POST', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | undefined;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    await act(async () => {
      root = createRoot(container);
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            AuthenticatedActionProvider,
            null,
            createElement(AccountScreen),
          ),
        ),
      );
    });

    await settleUntil(() => {
      expect(mocks.connectWallet).toHaveBeenCalledTimes(1);
      if (mocks.getUserByWallet.mock.calls.length === 0) {
        throw new Error('user query has not followed bootstrap yet');
      }
    });

    // Let every consumer finish its post-bootstrap work before counting.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mocks.connectWallet).toHaveBeenCalledTimes(1);
    expect(mocks.connectWallet).toHaveBeenCalledWith('0xaaa');
    expect(mocks.getUserByWallet).toHaveBeenCalledWith('0xaaa');

    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });

  it('renders the account screen with resolved user data', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | undefined;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    await act(async () => {
      root = createRoot(container);
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            AuthenticatedActionProvider,
            null,
            createElement(AccountScreen),
          ),
        ),
      );
    });

    await settleUntil(() => {
      if (!container.textContent?.includes('user@example.com')) {
        throw new Error('user email not rendered');
      }
    });
    expect(container.textContent).toContain('user@example.com');
    expect(container.textContent).toContain('0xaaa');

    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });
});
