// @vitest-environment jsdom
import { CACHE_WINDOW } from '@core/config/cacheWindow';
import { queryKeys } from '@core/lib/state/queryClient';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
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
  it('starts idle and ignores empty polling ids', () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useEtlJobPolling(), { wrapper });

    expect(result.current.state).toEqual({
      jobId: null,
      status: 'idle',
      errorMessage: undefined,
      isLoading: false,
      isInProgress: false,
    });
    act(() => result.current.startPolling('', 'user-1'));
    expect(result.current.state.jobId).toBeNull();
  });

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

  it('refetches fresh analytics queries when ETL completes', async () => {
    mocks.getEtlJobStatus.mockResolvedValue({
      jobId: 'job-fresh',
      status: 'completed',
      createdAt: '2026-08-02T00:00:00.000Z',
    });
    const { client, wrapper } = createHarness();
    const keys = [
      queryKeys.portfolio.landingPage('user-1'),
      queryKeys.portfolioDashboard.detail('user-1', {}),
      queryKeys.dailyYield.list('user-1', 30, null),
    ];
    const fetchers = keys.map(() => vi.fn().mockResolvedValue('after-etl'));
    keys.forEach((key) => client.setQueryData(key, 'before-etl'));
    const { result } = renderHook(
      () => {
        useQuery({
          queryKey: keys[0]!,
          queryFn: fetchers[0]!,
          staleTime: CACHE_WINDOW.staleTimeMs,
        });
        useQuery({
          queryKey: keys[1]!,
          queryFn: fetchers[1]!,
          staleTime: CACHE_WINDOW.staleTimeMs,
        });
        useQuery({
          queryKey: keys[2]!,
          queryFn: fetchers[2]!,
          staleTime: CACHE_WINDOW.staleTimeMs,
        });
        return useEtlJobPolling();
      },
      { wrapper },
    );
    fetchers.forEach((fetcher) => expect(fetcher).not.toHaveBeenCalled());
    act(() => result.current.startPolling('job-fresh', 'user-1'));
    await waitFor(() => expect(result.current.state.status).toBe('completed'));
    fetchers.forEach((fetcher) => expect(fetcher).toHaveBeenCalledTimes(1));
    keys.forEach((key) => expect(client.getQueryData(key)).toBe('after-etl'));
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

  it('tracks pending and processing remote statuses as in-progress', async () => {
    mocks.getEtlJobStatus
      .mockResolvedValueOnce({
        jobId: 'job-progress',
        status: 'pending',
        createdAt: '2026-08-02T00:00:00.000Z',
      })
      .mockResolvedValue({
        jobId: 'job-progress',
        status: 'processing',
        createdAt: '2026-08-02T00:00:00.000Z',
      });
    const { client, wrapper } = createHarness();
    const { result } = renderHook(() => useEtlJobPolling(), { wrapper });

    act(() => result.current.startPolling('job-progress', 'user-1'));
    await waitFor(() => expect(result.current.state.status).toBe('pending'));
    expect(result.current.state.isInProgress).toBe(true);

    await act(async () => {
      await client.invalidateQueries({ queryKey: ['etl-job-status'] });
    });
    await waitFor(() => expect(result.current.state.status).toBe('processing'));
    expect(result.current.state.isInProgress).toBe(true);
  });

  it('refreshes only global portfolio cache when no user id is attached', async () => {
    mocks.getEtlJobStatus.mockResolvedValue({
      jobId: 'job-global',
      status: 'completed',
      createdAt: '2026-08-02T00:00:00.000Z',
    });
    const { invalidateSpy, wrapper } = createHarness();
    const { result } = renderHook(() => useEtlJobPolling(), { wrapper });

    act(() => result.current.startPolling('job-global', '   '));
    await waitFor(() => expect(result.current.state.status).toBe('completed'));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts a successful ETL trigger and begins polling the returned job id', async () => {
    mocks.triggerWalletDataFetch.mockResolvedValue({
      rate_limited: false,
      job_id: 'triggered-job',
      message: 'started',
    });
    mocks.getEtlJobStatus.mockResolvedValue({
      jobId: 'triggered-job',
      status: 'pending',
      createdAt: '2026-08-02T00:00:00.000Z',
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useEtlJobPolling(), { wrapper });

    await act(async () => {
      await result.current.triggerEtl('user-1', '0xabc');
    });
    expect(result.current.state.jobId).toBe('triggered-job');
    expect(result.current.state.status).toBe('pending');
    expect(result.current.state.isInProgress).toBe(true);
    await waitFor(() =>
      expect(mocks.getEtlJobStatus).toHaveBeenCalledWith('triggered-job'),
    );
  });

  it('uses response and default errors when trigger succeeds without a job id', async () => {
    const { wrapper } = createHarness();
    const first = renderHook(() => useEtlJobPolling(), { wrapper });
    mocks.triggerWalletDataFetch.mockResolvedValueOnce({
      rate_limited: false,
      message: 'No job created',
    });
    await act(async () => {
      await first.result.current.triggerEtl('user-1', '0xabc');
    });
    expect(first.result.current.state).toMatchObject({
      status: 'failed',
      errorMessage: 'No job created',
    });
    first.unmount();

    const second = renderHook(() => useEtlJobPolling(), { wrapper });
    mocks.triggerWalletDataFetch.mockResolvedValueOnce({ rate_limited: false });
    await act(async () => {
      await second.result.current.triggerEtl('user-1', '0xabc');
    });
    expect(second.result.current.state.errorMessage).toBe(
      'Failed to trigger ETL',
    );
  });

  it('normalizes thrown trigger errors from Error and non-Error values', async () => {
    const { wrapper } = createHarness();
    const first = renderHook(() => useEtlJobPolling(), { wrapper });
    mocks.triggerWalletDataFetch.mockRejectedValueOnce(
      new Error('network down'),
    );
    await act(async () => {
      await first.result.current.triggerEtl('user-1', '0xabc');
    });
    expect(first.result.current.state.errorMessage).toBe('network down');
    first.unmount();

    const second = renderHook(() => useEtlJobPolling(), { wrapper });
    mocks.triggerWalletDataFetch.mockRejectedValueOnce('bad');
    await act(async () => {
      await second.result.current.triggerEtl('user-1', '0xabc');
    });
    expect(second.result.current.state.errorMessage).toBe(
      'Failed to trigger ETL',
    );
  });

  it('surfaces polling request errors and stops progress', async () => {
    mocks.getEtlJobStatus.mockRejectedValue(new Error('poll failed'));
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useEtlJobPolling(), { wrapper });

    act(() => result.current.startPolling('job-error', 'user-1'));
    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state.errorMessage).toBe('poll failed');
    expect(result.current.state.isInProgress).toBe(false);
  });

  it('reset and completeTransition clear state and cached polling queries', async () => {
    mocks.getEtlJobStatus.mockResolvedValue({
      jobId: 'job-reset',
      status: 'pending',
      createdAt: '2026-08-02T00:00:00.000Z',
    });
    const { client, wrapper } = createHarness();
    const removeSpy = vi.spyOn(client, 'removeQueries');
    const { result } = renderHook(() => useEtlJobPolling(), { wrapper });

    act(() => result.current.startPolling('job-reset', 'user-1'));
    await waitFor(() => expect(result.current.state.jobId).toBe('job-reset'));
    act(() => result.current.reset());
    expect(result.current.state).toMatchObject({ jobId: null, status: 'idle' });
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ['etl-job-status'] });

    act(() => result.current.startPolling('job-reset', 'user-1'));
    act(() => result.current.completeTransition());
    expect(result.current.state.jobId).toBeNull();
  });
});
