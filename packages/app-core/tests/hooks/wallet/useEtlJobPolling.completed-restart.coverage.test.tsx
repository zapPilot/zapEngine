// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEtlJobStatus: vi.fn(),
}));

vi.mock('@core/services', () => ({
  getEtlJobStatus: mocks.getEtlJobStatus,
  triggerWalletDataFetch: vi.fn(),
}));

import { useEtlJobPolling } from '@core/hooks/wallet/useEtlJobPolling';

function createHarness() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

  return { invalidateSpy, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useEtlJobPolling completed restart coverage', () => {
  it('does not refresh portfolio caches twice when restarting an already completed job', async () => {
    mocks.getEtlJobStatus.mockResolvedValue({
      jobId: 'job-completed',
      status: 'completed',
      createdAt: '2026-09-18T00:00:00.000Z',
    });
    const { invalidateSpy, wrapper } = createHarness();
    const { result } = renderHook(() => useEtlJobPolling(), { wrapper });

    act(() => result.current.startPolling('job-completed', 'user-1'));
    await waitFor(() => expect(result.current.state.status).toBe('completed'));
    const invalidationCount = invalidateSpy.mock.calls.length;

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.state.status).toBe('idle'));

    act(() => result.current.startPolling('job-completed', 'user-1'));
    await waitFor(() => expect(result.current.state.status).toBe('completed'));

    expect(invalidateSpy).toHaveBeenCalledTimes(invalidationCount);
    expect(result.current.state.jobId).toBe('job-completed');
    expect(mocks.getEtlJobStatus).toHaveBeenCalledTimes(2);
  });
});
