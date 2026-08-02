// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEtlJobStatus: vi.fn(),
  triggerWalletDataFetch: vi.fn(),
}));

vi.mock('@core/services', () => ({
  getEtlJobStatus: mocks.getEtlJobStatus,
  triggerWalletDataFetch: mocks.triggerWalletDataFetch,
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

  return { client, invalidateSpy, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useEtlJobPolling', () => {
  it('refreshes portfolio caches and preserves completed status', async () => {
    mocks.getEtlJobStatus.mockResolvedValue({
      jobId: 'job-1',
      status: 'completed',
      createdAt: '2026-08-02T00:00:00.000Z',
    });
    const { invalidateSpy, wrapper } = createHarness();
    const { result } = renderHook(() => useEtlJobPolling(), { wrapper });

    act(() => result.current.startPolling('job-1', 'user-1'));

    await waitFor(() => expect(result.current.state.status).toBe('completed'));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['portfolio-dashboard', 'user-1'],
    });
    expect(result.current.state.jobId).toBe('job-1');
  });

  it('stops with a failed status and exposes the ETL error', async () => {
    mocks.getEtlJobStatus.mockResolvedValue({
      jobId: 'job-2',
      status: 'failed',
      createdAt: '2026-08-02T00:00:00.000Z',
      error: { message: 'Import failed' },
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useEtlJobPolling(), { wrapper });

    act(() => result.current.startPolling('job-2', 'user-1'));

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state.errorMessage).toBe('Import failed');
    expect(result.current.state.isInProgress).toBe(false);
  });

  it('surfaces rate limits as retryable failures without polling', async () => {
    mocks.triggerWalletDataFetch.mockResolvedValue({
      rate_limited: true,
      message: 'Please try again later',
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useEtlJobPolling(), { wrapper });

    await act(async () => {
      await result.current.triggerEtl('user-1', '0xabc');
    });

    expect(result.current.state).toMatchObject({
      jobId: null,
      status: 'failed',
      errorMessage: 'Please try again later',
      isInProgress: false,
    });
    expect(mocks.getEtlJobStatus).not.toHaveBeenCalled();
  });
});
