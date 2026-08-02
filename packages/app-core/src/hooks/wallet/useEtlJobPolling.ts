/**
 * useEtlJobPolling Hook
 *
 * React Query hook for polling ETL job status.
 * Used for on-the-fly wallet data fetching.
 *
 * Features:
 * - Auto-polls job status every 3 seconds while job is pending/processing
 * - Auto-stops polling when job completes or fails
 * - Refreshes portfolio query caches after a completed import
 * - Provides retry-friendly terminal states and error handling
 */

import { queryKeys } from '@core/lib/state/queryClient';
import {
  type EtlJobResponse,
  type EtlJobStatus,
  getEtlJobStatus,
  triggerWalletDataFetch,
} from '@core/services';
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ETL job polling state
 */
export interface EtlJobPollingState {
  /** Current job ID being polled */
  jobId: string | null;
  /** Current job status */
  status:
    | 'idle'
    | 'pending'
    | 'processing'
    | 'completing'
    | 'completed'
    | 'failed';
  /** Error message if job failed */
  errorMessage: string | undefined;
  /** Whether the job trigger or status request is currently loading */
  isLoading: boolean;
  /** Whether ETL is actively in progress (pending, processing, or completing) */
  isInProgress: boolean;
}

/**
 * Hook return type
 */
export interface UseEtlJobPollingReturn {
  /** Current polling state */
  state: EtlJobPollingState;
  /** Trigger a new ETL job for a wallet */
  triggerEtl: (userId: string, walletAddress: string) => Promise<void>;
  /** Start polling an existing ETL job */
  startPolling: (jobId: string, userId?: string | null) => void;
  /** Reset the polling state */
  reset: () => void;
  /** Complete the transition and clear the polling state */
  completeTransition: () => void;
}

const ETL_JOB_QUERY_KEY = ['etl-job-status'] as const;
const POLLING_INTERVAL = 3000;
const DEFAULT_TRIGGER_ERROR_MESSAGE = 'Failed to trigger ETL';
const PENDING_STATUS = 'pending';
const PROCESSING_STATUS = 'processing';
const COMPLETED_STATUS = 'completed';
const FAILED_STATUS = 'failed';
const ETL_IN_PROGRESS_STATUSES: ReadonlySet<EtlJobPollingState['status']> =
  new Set(['pending', 'processing', 'completing']);

function statusFromJob(
  jobStatus: EtlJobStatus | undefined,
): EtlJobPollingState['status'] | null {
  if (!jobStatus) return null;
  if (jobStatus.status === COMPLETED_STATUS) return 'completing';
  if (jobStatus.status === FAILED_STATUS) return 'failed';
  if (jobStatus.status === PROCESSING_STATUS) return 'processing';
  return 'pending';
}

function deriveStatus(
  jobId: string | null,
  jobStatus: EtlJobStatus | undefined,
  latestStatus: EtlJobPollingState['status'] | null,
  triggerError: string | undefined,
): EtlJobPollingState['status'] {
  if (
    latestStatus === 'completed' ||
    latestStatus === 'failed' ||
    latestStatus === 'completing'
  ) {
    return latestStatus;
  }

  const remoteStatus = statusFromJob(jobStatus);
  if (remoteStatus) return remoteStatus;
  if (latestStatus) return latestStatus;
  if (triggerError) return 'failed';
  return jobId ? 'pending' : 'idle';
}

async function refreshPortfolioQueryCaches(
  queryClient: QueryClient,
  userId: string | null,
): Promise<void> {
  const invalidations: Promise<void>[] = [
    queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all }),
  ];

  if (userId) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: ['portfolio-dashboard', userId],
      }),
      queryClient.invalidateQueries({ queryKey: ['dailyYield', userId] }),
      queryClient.invalidateQueries({
        queryKey: ['desktop', 'portfolio', 'dailyYield', userId],
      }),
    );
  }

  await Promise.all(invalidations);
}

/**
 * Hook for polling ETL job status
 */
export function useEtlJobPolling(): UseEtlJobPollingReturn {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobUserId, setJobUserId] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | undefined>();
  const [isTriggering, setIsTriggering] = useState(false);
  const [latestStatus, setLatestStatus] = useState<
    EtlJobPollingState['status'] | null
  >(null);
  const activeJobIdRef = useRef<string | null>(null);
  const refreshedJobIdsRef = useRef(new Set<string>());

  const {
    data: jobStatus,
    isLoading: isPolling,
    error: pollingError,
    isError: isPollingError,
  } = useQuery<EtlJobStatus>({
    queryKey: [...ETL_JOB_QUERY_KEY, jobId],
    queryFn: () => getEtlJobStatus(jobId!),
    enabled:
      !!jobId &&
      latestStatus !== 'completed' &&
      latestStatus !== 'failed' &&
      latestStatus !== 'completing',
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === COMPLETED_STATUS || data?.status === FAILED_STATUS) {
        return false;
      }
      return POLLING_INTERVAL;
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (!jobId || !jobStatus) return;

    if (jobStatus.status === FAILED_STATUS) {
      setLatestStatus('failed');
      return;
    }

    if (jobStatus.status !== COMPLETED_STATUS) {
      setLatestStatus(statusFromJob(jobStatus));
      return;
    }

    if (refreshedJobIdsRef.current.has(jobId)) {
      setLatestStatus('completed');
      return;
    }

    refreshedJobIdsRef.current.add(jobId);
    setLatestStatus('completing');

    const completeRefresh = async () => {
      try {
        await refreshPortfolioQueryCaches(queryClient, jobUserId);
      } finally {
        if (activeJobIdRef.current === jobId) {
          setLatestStatus('completed');
        }
      }
    };

    void completeRefresh();
  }, [jobId, jobStatus, jobUserId, queryClient]);

  useEffect(() => {
    if (!isPollingError) return;
    setLatestStatus('failed');
  }, [isPollingError]);

  const status = deriveStatus(jobId, jobStatus, latestStatus, triggerError);
  const errorMessage =
    triggerError ||
    jobStatus?.error?.message ||
    (pollingError instanceof Error ? pollingError.message : undefined);
  const hasPendingJob = Boolean(
    jobId && (!jobStatus || jobStatus.status === PENDING_STATUS),
  );

  const state: EtlJobPollingState = {
    jobId,
    status,
    errorMessage,
    isLoading: isTriggering || isPolling || hasPendingJob,
    isInProgress: ETL_IN_PROGRESS_STATUSES.has(status),
  };

  const triggerEtl = useCallback(
    async (userId: string, walletAddress: string) => {
      setTriggerError(undefined);
      setIsTriggering(true);
      setLatestStatus('pending');
      setJobUserId(userId);
      setJobId(null);
      activeJobIdRef.current = null;

      try {
        const response: EtlJobResponse = await triggerWalletDataFetch(
          userId,
          walletAddress,
        );

        if (response.rate_limited) {
          setTriggerError(response.message);
          setLatestStatus('failed');
          return;
        }

        if (!response.job_id) {
          setTriggerError(response.message || DEFAULT_TRIGGER_ERROR_MESSAGE);
          setLatestStatus('failed');
          return;
        }

        activeJobIdRef.current = response.job_id;
        setJobId(response.job_id);
        setLatestStatus('pending');
      } catch (error) {
        setTriggerError(
          error instanceof Error
            ? error.message
            : DEFAULT_TRIGGER_ERROR_MESSAGE,
        );
        setLatestStatus('failed');
      } finally {
        setIsTriggering(false);
      }
    },
    [],
  );

  const startPolling = useCallback(
    (existingJobId: string, userId?: string | null) => {
      if (!existingJobId) return;
      setTriggerError(undefined);
      setJobUserId(userId?.trim() || null);
      setLatestStatus('pending');
      activeJobIdRef.current = existingJobId;
      setJobId(existingJobId);
    },
    [],
  );

  const reset = useCallback(() => {
    activeJobIdRef.current = null;
    setJobId(null);
    setJobUserId(null);
    setTriggerError(undefined);
    setIsTriggering(false);
    setLatestStatus(null);
    queryClient.removeQueries({ queryKey: ETL_JOB_QUERY_KEY });
  }, [queryClient]);

  return { state, triggerEtl, startPolling, reset, completeTransition: reset };
}
