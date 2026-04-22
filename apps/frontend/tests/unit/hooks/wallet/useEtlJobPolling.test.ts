import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEtlJobPolling } from '@/hooks/wallet/useEtlJobPolling';
import type { EtlJobResponse, EtlJobStatus } from '@/services/accountService';

import { act, renderHook, waitFor } from '../../../test-utils';

vi.mock('@/services/accountService', () => ({
  getEtlJobStatus: vi.fn(),
  triggerWalletDataFetch: vi.fn(),
}));

const { getEtlJobStatus, triggerWalletDataFetch } =
  await import('@/services/accountService');
const USER_ID = 'user-123';
const WALLET_ADDRESS = '0x123abc';
const DEFAULT_JOB_ID = 'job-123';

function renderUseEtlJobPolling() {
  return renderHook(() => useEtlJobPolling());
}

function createTriggerResponse(
  overrides: Partial<EtlJobResponse> = {},
): EtlJobResponse {
  return {
    job_id: DEFAULT_JOB_ID,
    status: 'pending',
    message: 'ETL job started',
    rate_limited: false,
    ...overrides,
  };
}

function createJobStatus(
  status: EtlJobStatus['status'],
  overrides: Partial<EtlJobStatus> = {},
): EtlJobStatus {
  const now = new Date().toISOString();

  return {
    job_id: DEFAULT_JOB_ID,
    status,
    created_at: now,
    updated_at: now,
    ...overrides,
  } as EtlJobStatus;
}

describe('useEtlJobPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEtlJobStatus).mockResolvedValue(createJobStatus('pending'));
  });

  it('returns idle state and all public methods initially', () => {
    const { result } = renderUseEtlJobPolling();

    expect(result.current.state).toEqual({
      jobId: null,
      status: 'idle',
      errorMessage: undefined,
      isLoading: false,
      isInProgress: false,
    });

    expect(result.current.triggerEtl).toBeInstanceOf(Function);
    expect(result.current.startPolling).toBeInstanceOf(Function);
    expect(result.current.reset).toBeInstanceOf(Function);
    expect(result.current.completeTransition).toBeInstanceOf(Function);
  });

  it('triggers ETL and starts pending polling', async () => {
    vi.mocked(triggerWalletDataFetch).mockResolvedValue(
      createTriggerResponse({
        job_id: 'new-job-123',
      }),
    );

    const { result } = renderHook(() => useEtlJobPolling());

    await act(async () => {
      await result.current.triggerEtl(USER_ID, WALLET_ADDRESS);
    });

    expect(triggerWalletDataFetch).toHaveBeenCalledWith(
      USER_ID,
      WALLET_ADDRESS,
    );
    expect(result.current.state.jobId).toBe('new-job-123');
    expect(result.current.state.status).toBe('pending');
  });

  it('returns rate-limit message when trigger endpoint is rate-limited', async () => {
    vi.mocked(triggerWalletDataFetch).mockResolvedValue(
      createTriggerResponse({
        job_id: null,
        message: 'Too many requests. Please wait.',
        rate_limited: true,
      }),
    );

    const { result } = renderUseEtlJobPolling();

    await act(async () => {
      await result.current.triggerEtl(USER_ID, WALLET_ADDRESS);
    });

    expect(result.current.state.jobId).toBeNull();
    expect(result.current.state.errorMessage).toBe(
      'Too many requests. Please wait.',
    );
  });

  it('returns trigger error message from Error instances', async () => {
    vi.mocked(triggerWalletDataFetch).mockRejectedValue(
      new Error('Network error occurred'),
    );

    const { result } = renderUseEtlJobPolling();

    await act(async () => {
      await result.current.triggerEtl(USER_ID, WALLET_ADDRESS);
    });

    expect(result.current.state.errorMessage).toBe('Network error occurred');
  });

  it('returns default trigger error for non-Error failures', async () => {
    vi.mocked(triggerWalletDataFetch).mockRejectedValue('string error');

    const { result } = renderUseEtlJobPolling();

    await act(async () => {
      await result.current.triggerEtl(USER_ID, WALLET_ADDRESS);
    });

    expect(result.current.state.errorMessage).toBe('Failed to trigger ETL');
  });

  it('starts polling for existing job IDs and ignores empty job IDs', () => {
    const { result } = renderUseEtlJobPolling();

    act(() => {
      result.current.startPolling('existing-job-456');
    });

    expect(result.current.state.jobId).toBe('existing-job-456');
    expect(result.current.state.status).toBe('pending');

    act(() => {
      result.current.startPolling('');
    });

    expect(result.current.state.jobId).toBe('existing-job-456');
  });

  it('maps API completed status to internal completing status', async () => {
    vi.mocked(getEtlJobStatus).mockResolvedValue(createJobStatus('completed'));

    const { result } = renderUseEtlJobPolling();

    act(() => {
      result.current.startPolling(DEFAULT_JOB_ID);
    });

    await waitFor(() => {
      expect(getEtlJobStatus).toHaveBeenCalledWith(DEFAULT_JOB_ID);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('completing');
    });
  });

  it('tracks processing and failed statuses from polling responses', async () => {
    vi.mocked(getEtlJobStatus)
      .mockResolvedValueOnce(createJobStatus('processing'))
      .mockResolvedValueOnce(
        createJobStatus('failed', {
          error: { message: 'ETL processing failed' },
        } as Partial<EtlJobStatus>),
      );

    const { result } = renderUseEtlJobPolling();

    act(() => {
      result.current.startPolling(DEFAULT_JOB_ID);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('processing');
    });

    act(() => {
      result.current.reset();
      result.current.startPolling(DEFAULT_JOB_ID);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('failed');
    });
    expect(result.current.state.errorMessage).toBe('ETL processing failed');
  });

  it('keeps isLoading true while pending', async () => {
    vi.mocked(getEtlJobStatus).mockResolvedValue(createJobStatus('pending'));

    const { result } = renderUseEtlJobPolling();

    act(() => {
      result.current.startPolling(DEFAULT_JOB_ID);
    });

    await waitFor(() => {
      expect(result.current.state.isLoading).toBe(true);
    });
  });

  it('resets state and clears trigger errors', async () => {
    vi.mocked(triggerWalletDataFetch).mockRejectedValue(
      new Error('Some error'),
    );

    const { result } = renderUseEtlJobPolling();

    await act(async () => {
      await result.current.triggerEtl(USER_ID, WALLET_ADDRESS);
    });

    expect(result.current.state.errorMessage).toBe('Some error');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toEqual({
      jobId: null,
      status: 'idle',
      errorMessage: undefined,
      isLoading: false,
      isInProgress: false,
    });
  });

  it('transitions from completing to idle via completeTransition', async () => {
    vi.mocked(getEtlJobStatus).mockResolvedValue(createJobStatus('completed'));

    const { result } = renderUseEtlJobPolling();

    act(() => {
      result.current.startPolling(DEFAULT_JOB_ID);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('completing');
    });

    act(() => {
      result.current.completeTransition();
    });

    expect(result.current.state).toEqual({
      jobId: null,
      status: 'idle',
      errorMessage: undefined,
      isLoading: false,
      isInProgress: false,
    });
  });
});
