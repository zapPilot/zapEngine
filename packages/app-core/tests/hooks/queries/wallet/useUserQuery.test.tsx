// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  getUserByWallet: vi.fn(),
  getUserProfile: vi.fn(),
  activeAddress: { value: null as string | null },
}));

vi.mock('@core/services/accountService', () => ({
  connectWallet: mocks.connectWallet,
  getUserByWallet: mocks.getUserByWallet,
  getUserProfile: mocks.getUserProfile,
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: () => ({
    account: mocks.activeAddress.value
      ? { address: mocks.activeAddress.value, isConnected: true }
      : null,
  }),
}));

import {
  resetAccountBootstrapForTests,
  suspendAccountBootstrap,
} from '@core/lib/state/accountBootstrap';
import {
  useCurrentUser,
  useUserById,
} from '@core/hooks/queries/wallet/useUserQuery';

const USER_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';

function createWrapper(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  }),
) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
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

function mockSuccessfulBootstrap() {
  mocks.connectWallet.mockResolvedValue({
    user_id: USER_ID,
    is_new_user: false,
  });
  mockProfile(true);
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMacrotasks(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function mountConsumers(client: QueryClient, count: number) {
  const consumers = Array.from({ length: count }, () =>
    renderHook(() => useCurrentUser(), { wrapper: createWrapper(client) }),
  );
  return {
    consumers,
    rerenderAll() {
      consumers.forEach(({ rerender }) => rerender());
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAccountBootstrapForTests();
  mocks.activeAddress.value = null;
  mocks.getUserByWallet.mockResolvedValue({ user_id: USER_ID });
});

afterEach(() => {
  resetAccountBootstrapForTests();
});

describe('useCurrentUser session identity', () => {
  it('keeps the original account while the active ownership signer changes', async () => {
    mocks.activeAddress.value = '0xaaa';
    mockSuccessfulBootstrap();

    const { result, rerender } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    mocks.activeAddress.value = '0xbbb';
    rerender();

    expect(result.current.userInfo?.userId).toBe(USER_ID);
    expect(result.current.connectedWallet).toBe('0xbbb');
    expect(mocks.connectWallet).toHaveBeenCalledTimes(1);
    expect(mocks.connectWallet).toHaveBeenCalledWith('0xaaa');
    expect(mocks.getUserByWallet).toHaveBeenCalledWith('0xaaa');
  });

  it('does not bootstrap the account again after the query cache is cleared', async () => {
    mocks.activeAddress.value = '0xaaa';
    mockSuccessfulBootstrap();
    const client = makeClient();

    const { result, rerender } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    client.clear();
    rerender();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.connectWallet).toHaveBeenCalledTimes(1);
    expect(mocks.getUserByWallet.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('useCurrentUser bootstrap coordination', () => {
  it('collapses four concurrent consumers into one bootstrap POST', async () => {
    mocks.activeAddress.value = '0xaaa';
    mockSuccessfulBootstrap();

    const { consumers } = mountConsumers(makeClient(), 4);

    await waitFor(() => {
      consumers.forEach(({ result }) =>
        expect(result.current.isSuccess).toBe(true),
      );
    });

    expect(mocks.connectWallet).toHaveBeenCalledTimes(1);
    expect(mocks.connectWallet).toHaveBeenCalledWith('0xaaa');
    expect(mocks.getUserByWallet).toHaveBeenCalledWith('0xaaa');
  });

  it('does not re-bootstrap for a late-mounted consumer', async () => {
    mocks.activeAddress.value = '0xaaa';
    mockSuccessfulBootstrap();

    const { consumers } = mountConsumers(makeClient(), 4);
    await waitFor(() => {
      consumers.forEach(({ result }) =>
        expect(result.current.isSuccess).toBe(true),
      );
    });

    const late = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(makeClient()),
    });
    await waitFor(() => expect(late.result.current.isSuccess).toBe(true));

    expect(mocks.connectWallet).toHaveBeenCalledTimes(1);
  });

  it('bootstraps once per session across a disconnect and reconnect', async () => {
    mocks.activeAddress.value = '0xaaa';
    mockSuccessfulBootstrap();

    const mounted = mountConsumers(makeClient(), 2);
    await waitFor(() => {
      mounted.consumers.forEach(({ result }) =>
        expect(result.current.isSuccess).toBe(true),
      );
    });
    expect(mocks.connectWallet).toHaveBeenCalledTimes(1);

    mocks.activeAddress.value = null;
    mounted.rerenderAll();
    await waitFor(() =>
      mounted.consumers.forEach(({ result }) =>
        expect(result.current.isConnected).toBe(false),
      ),
    );
    await flushMacrotasks();
    expect(mocks.connectWallet).toHaveBeenCalledTimes(1);

    mocks.activeAddress.value = '0xaaa';
    mounted.rerenderAll();
    await waitFor(() =>
      mounted.consumers.forEach(({ result }) =>
        expect(result.current.isSuccess).toBe(true),
      ),
    );
    expect(mocks.connectWallet).toHaveBeenCalledTimes(2);
    expect(mocks.connectWallet).toHaveBeenNthCalledWith(2, '0xaaa');
  });

  it('bootstraps independently when a different wallet connects next session', async () => {
    mocks.activeAddress.value = '0xaaa';
    mockSuccessfulBootstrap();

    const mounted = mountConsumers(makeClient(), 2);
    await waitFor(() => {
      mounted.consumers.forEach(({ result }) =>
        expect(result.current.isSuccess).toBe(true),
      );
    });

    mocks.activeAddress.value = null;
    mounted.rerenderAll();
    await waitFor(() =>
      mounted.consumers.forEach(({ result }) =>
        expect(result.current.isConnected).toBe(false),
      ),
    );

    mocks.activeAddress.value = '0xbbb';
    mockSuccessfulBootstrap();
    mounted.rerenderAll();
    await waitFor(() =>
      mounted.consumers.forEach(({ result }) =>
        expect(result.current.isSuccess).toBe(true),
      ),
    );

    expect(mocks.connectWallet).toHaveBeenCalledTimes(2);
    expect(mocks.connectWallet).toHaveBeenNthCalledWith(2, '0xbbb');
    expect(mocks.getUserByWallet).toHaveBeenLastCalledWith('0xbbb');
  });

  it('never bootstraps a suspended wallet on remount or refetch', async () => {
    suspendAccountBootstrap('0xaaa');
    mocks.activeAddress.value = '0xaaa';
    mockSuccessfulBootstrap();

    const mounted = mountConsumers(makeClient(), 2);
    await flushMacrotasks();

    mounted.consumers.forEach(({ result }) => {
      expect(result.current.isConnected).toBe(true);
      expect(result.current.isSuccess).toBe(false);
    });
    expect(mocks.connectWallet).not.toHaveBeenCalled();

    await mounted.consumers[0].result.current.refetch();
    await flushMacrotasks();
    expect(mocks.connectWallet).not.toHaveBeenCalled();
  });

  it('recovers through refetch after a failed bootstrap', async () => {
    mocks.activeAddress.value = '0xaaa';
    mocks.connectWallet
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ user_id: USER_ID, is_new_user: false });
    mockProfile(true);

    const mounted = mountConsumers(makeClient(), 1);
    const { result } = mounted.consumers[0];

    await waitFor(() => expect(result.current.error).toBe('network down'));
    expect(result.current.isSuccess).toBe(false);

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.connectWallet).toHaveBeenCalledTimes(2);
    expect(mocks.getUserByWallet).toHaveBeenCalledWith('0xaaa');
  });

  it('ignores a stale bootstrap completion after disconnect and retries cleanly', async () => {
    mocks.activeAddress.value = '0xaaa';
    const gate = deferred();
    mocks.connectWallet.mockImplementationOnce(() => gate.promise);

    const mounted = mountConsumers(makeClient(), 1);
    const { result } = mounted.consumers[0];
    await waitFor(() => expect(mocks.connectWallet).toHaveBeenCalledTimes(1));

    mocks.activeAddress.value = null;
    mounted.rerenderAll();
    await waitFor(() => expect(result.current.isConnected).toBe(false));

    gate.resolve();
    await flushMacrotasks();

    expect(result.current.isSuccess).toBe(false);
    expect(mocks.getUserByWallet).not.toHaveBeenCalled();

    mockSuccessfulBootstrap();
    mocks.activeAddress.value = '0xaaa';
    mounted.rerenderAll();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.connectWallet).toHaveBeenCalledTimes(2);
    expect(mocks.getUserByWallet).toHaveBeenCalledWith('0xaaa');
  });
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
