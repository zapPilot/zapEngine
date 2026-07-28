// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  getUserProfile: vi.fn(),
}));

vi.mock('@core/services', () => ({
  connectWallet: mocks.connectWallet,
  getUserProfile: mocks.getUserProfile,
}));

import { useUserById } from '@core/hooks/queries/wallet/useUserQuery';

const USER_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function mockProfile(isSubscribedToReports: boolean) {
  mocks.getUserProfile.mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'user@example.com',
      is_subscribed_to_reports: isSubscribedToReports,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    wallets: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUserById report subscription state', () => {
  it('maps a subscribed profile to UserInfo', async () => {
    mockProfile(true);
    const { result } = renderHook(() => useUserById(USER_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.isSubscribedToReports).toBe(true);
  });

  it('keeps an email while mapping an unsubscribed profile as unsubscribed', async () => {
    mockProfile(false);
    const { result } = renderHook(() => useUserById(USER_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(
      expect.objectContaining({
        email: 'user@example.com',
        isSubscribedToReports: false,
      }),
    );
  });
});
