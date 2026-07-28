// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  showToast: vi.fn(),
  useUser: vi.fn(),
}));

vi.mock('@core/hooks/queries/wallet/useUser', () => ({
  useUser: mocks.useUser,
}));

vi.mock('@core/providers/ToastContext', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

import { useEmailSubscription } from '@core/hooks/bundle/useEmailSubscription';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useUser.mockReturnValue({
    userInfo: null,
    refetch: mocks.refetch,
  });
});

describe('useEmailSubscription', () => {
  it('uses the report flag instead of treating a stored email as subscribed', async () => {
    mocks.useUser.mockReturnValue({
      userInfo: {
        email: 'user@example.com',
        isSubscribedToReports: false,
      },
      refetch: mocks.refetch,
    });

    const { result } = renderHook(() =>
      useEmailSubscription({
        viewingUserId: 'user-1',
        realUserId: 'user-1',
        isOpen: true,
        onEmailSubscribed: undefined,
      }),
    );

    await waitFor(() => expect(result.current.email).toBe('user@example.com'));
    expect(result.current.subscribedEmail).toBeNull();
  });

  it('shows the stored email as subscribed only when the report flag is true', async () => {
    mocks.useUser.mockReturnValue({
      userInfo: {
        email: 'user@example.com',
        isSubscribedToReports: true,
      },
      refetch: mocks.refetch,
    });

    const { result } = renderHook(() =>
      useEmailSubscription({
        viewingUserId: 'user-1',
        realUserId: 'user-1',
        isOpen: true,
        onEmailSubscribed: undefined,
      }),
    );

    await waitFor(() =>
      expect(result.current.subscribedEmail).toBe('user@example.com'),
    );
  });
});
