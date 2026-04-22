import type { QueryClient } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EtlJobPollingState } from '@/hooks/wallet/useEtlJobPolling';
import { useEtlJobSync } from '@/hooks/wallet/useEtlJobSync';
import type { AppRouterLike } from '@/lib/routing';

import { renderHook } from '../../../test-utils';

describe('useEtlJobSync', () => {
  let mockQueryClient: QueryClient;
  let mockRouter: AppRouterLike;
  let mockStartPolling: vi.Mock;
  let mockCompleteTransition: vi.Mock;
  let mockRefetch: vi.Mock;

  const USER_ID = 'user-123';
  const JOB_ID = 'job-456';

  beforeEach(() => {
    vi.clearAllMocks();

    mockQueryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueryClient;

    mockRouter = {
      replace: vi.fn(),
      push: vi.fn(),
    };

    mockStartPolling = vi.fn();
    mockCompleteTransition = vi.fn();
    mockRefetch = vi.fn().mockResolvedValue(undefined);

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/portfolio?etlJobId=job-456',
      },
      writable: true,
    });
  });

  function renderSyncHook(initialParams: {
    initialEtlJobId?: string;
    etlState: EtlJobPollingState;
  }) {
    return renderHook(
      (params) =>
        useEtlJobSync({
          initialEtlJobId: params.initialEtlJobId,
          etlState: params.etlState,
          startPolling: mockStartPolling,
          completeTransition: mockCompleteTransition,
          urlUserId: USER_ID,
          refetch: mockRefetch,
          queryClient: mockQueryClient,
          router: mockRouter,
        }),
      {
        initialProps: initialParams,
      },
    );
  }

  it('starts polling when initialEtlJobId is provided', () => {
    renderSyncHook({
      initialEtlJobId: JOB_ID,
      etlState: {
        jobId: null,
        status: 'idle',
        errorMessage: undefined,
        isLoading: false,
        isInProgress: false,
      },
    });

    expect(mockStartPolling).toHaveBeenCalledWith(JOB_ID);
  });

  it('does not start polling when initialEtlJobId is undefined', () => {
    renderSyncHook({
      initialEtlJobId: undefined,
      etlState: {
        jobId: null,
        status: 'idle',
        errorMessage: undefined,
        isLoading: false,
        isInProgress: false,
      },
    });

    expect(mockStartPolling).not.toHaveBeenCalled();
  });

  it("handles synchronization when etlState.status is 'completing'", async () => {
    const { rerender } = renderSyncHook({
      initialEtlJobId: JOB_ID,
      etlState: {
        jobId: JOB_ID,
        status: 'pending',
        errorMessage: undefined,
        isLoading: true,
        isInProgress: true,
      },
    });

    // Change state to completing
    await act(async () => {
      rerender({
        initialEtlJobId: JOB_ID,
        etlState: {
          jobId: JOB_ID,
          status: 'completing',
          errorMessage: undefined,
          isLoading: false,
          isInProgress: true,
        },
      });
    });

    await vi.waitFor(() => {
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalled();
      expect(mockRefetch).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalled();
      expect(mockCompleteTransition).toHaveBeenCalled();
    });
  });

  it('clears URL params if isNewUser is present', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/portfolio?isNewUser=true',
      },
      writable: true,
    });

    const { rerender } = renderSyncHook({
      initialEtlJobId: JOB_ID,
      etlState: {
        jobId: JOB_ID,
        status: 'pending',
        errorMessage: undefined,
        isLoading: true,
        isInProgress: true,
      },
    });

    await act(async () => {
      rerender({
        initialEtlJobId: JOB_ID,
        etlState: {
          jobId: JOB_ID,
          status: 'completing',
          errorMessage: undefined,
          isLoading: false,
          isInProgress: true,
        },
      });
    });

    await vi.waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.stringContaining('/portfolio'),
        { scroll: false },
      );
    });
  });

  it('does not clear URL params if job ID does not match and isNewUser is absent', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/portfolio?etlJobId=other-job',
      },
      writable: true,
    });

    const { rerender } = renderSyncHook({
      initialEtlJobId: JOB_ID,
      etlState: {
        jobId: JOB_ID,
        status: 'pending',
        errorMessage: undefined,
        isLoading: true,
        isInProgress: true,
      },
    });

    await act(async () => {
      rerender({
        initialEtlJobId: JOB_ID,
        etlState: {
          jobId: JOB_ID,
          status: 'completing',
          errorMessage: undefined,
          isLoading: false,
          isInProgress: true,
        },
      });
    });

    await vi.waitFor(() => {
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalled();
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("does not run completion logic if status is not 'completing'", async () => {
    renderSyncHook({
      initialEtlJobId: JOB_ID,
      etlState: {
        jobId: JOB_ID,
        status: 'processing',
        errorMessage: undefined,
        isLoading: true,
        isInProgress: true,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    await vi.waitFor(() => {}); // just wait a bit
    expect(mockCompleteTransition).not.toHaveBeenCalled();
  });
});
