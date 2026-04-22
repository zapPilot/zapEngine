/**
 * useEtlJobPolling Hook
 *
 * React Query hook for polling ETL job status.
 * Used for on-the-fly wallet data fetching.
 *
 * Features:
 * - Auto-polls job status every 3 seconds while job is pending/processing
 * - Auto-stops polling when job completes or fails
 * - Provides loading states and error handling
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import {
  type EtlJobResponse,
  type EtlJobStatus,
  getEtlJobStatus,
  triggerWalletDataFetch,
} from '@/services';

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
  /** Whether the job is currently loading */
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
  startPolling: (jobId: string) => void;
  /** Reset the polling state */
  reset: () => void;
  /** Complete the transition from 'completing' to 'idle' */
  completeTransition: () => void;
}

const ETL_JOB_QUERY_KEY = ['etl-job-status'];
const POLLING_INTERVAL = 3000;
const DEFAULT_TRIGGER_ERROR_MESSAGE = 'Failed to trigger ETL';
const PENDING_STATUS = 'pending';
const COMPLETED_STATUS = 'completed';
const FAILED_STATUS = 'failed';
const ETL_IN_PROGRESS_STATUSES: ReadonlySet<EtlJobPollingState['status']> =
  new Set(['pending', 'processing', 'completing']);

function normalizeStatus(status: string): EtlJobPollingState['status'] {
  if (status === COMPLETED_STATUS) {
    return 'completing';
  }

  return status as EtlJobPollingState['status'];
}

function deriveStatus(
  jobId: string | null,
  jobStatus: EtlJobStatus | undefined,
  latestStatus: EtlJobPollingState['status'] | null,
): EtlJobPollingState['status'] {
  if (!jobId) {
    return 'idle';
  }

  if (jobStatus) {
    return normalizeStatus(jobStatus.status);
  }

  if (latestStatus) {
    return latestStatus;
  }

  return PENDING_STATUS;
}

/**
 * Hook for polling ETL job status
 *
 * @example
 * ```tsx
 * const { state, triggerEtl, reset } = useEtlJobPolling();
 *
 * // Trigger ETL when wallet connects
 * await triggerEtl(userId, walletAddress);
 *
 * // Show loading UI while processing
 * if (state.isLoading) {
 *   return <LoadingSpinner />;
 * }
 * ```
 */
export function useEtlJobPolling(): UseEtlJobPollingReturn {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | undefined>();
  const [latestStatus, setLatestStatus] = useState<
    EtlJobPollingState['status'] | null
  >(null);

  const { data: jobStatus, isLoading: isPolling } = useQuery<EtlJobStatus>({
    queryKey: [...ETL_JOB_QUERY_KEY, jobId],
    queryFn: () => getEtlJobStatus(jobId!),
    enabled: !!jobId,
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
    if (!jobStatus) {
      return;
    }

    setLatestStatus(normalizeStatus(jobStatus.status));
  }, [jobStatus]);

  const status = deriveStatus(jobId, jobStatus, latestStatus);
  const errorMessage = triggerError || jobStatus?.error?.message;
  const hasPendingJob = Boolean(jobId && jobStatus?.status === PENDING_STATUS);

  const state: EtlJobPollingState = {
    jobId,
    status,
    errorMessage,
    isLoading: isPolling || hasPendingJob,
    isInProgress: ETL_IN_PROGRESS_STATUSES.has(status),
  };

  const triggerEtl = useCallback(
    async (userId: string, walletAddress: string) => {
      setTriggerError(undefined);

      try {
        const response: EtlJobResponse = await triggerWalletDataFetch(
          userId,
          walletAddress,
        );

        if (response.rate_limited) {
          setTriggerError(response.message);
          return;
        }

        if (response.job_id) {
          setLatestStatus(PENDING_STATUS);
          setJobId(response.job_id);
        }
      } catch (error) {
        setTriggerError(
          error instanceof Error
            ? error.message
            : DEFAULT_TRIGGER_ERROR_MESSAGE,
        );
      }
    },
    [],
  );

  const startPolling = useCallback((existingJobId: string) => {
    if (!existingJobId) {
      return;
    }
    setTriggerError(undefined);
    setLatestStatus(PENDING_STATUS);
    setJobId(existingJobId);
  }, []);

  const reset = useCallback(() => {
    setJobId(null);
    setTriggerError(undefined);
    setLatestStatus(null);
    queryClient.removeQueries({ queryKey: ETL_JOB_QUERY_KEY });
  }, [queryClient]);

  return { state, triggerEtl, startPolling, reset, completeTransition: reset };
}
