import { useToast } from '@zapengine/app-core/providers/ToastContext';
import type { AgentRunStatus } from '@zapengine/types/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { AGENT_ADDRESS, LOCAL_TRIGGER_URL } from '@/config/aiWalletDemo';
import {
  fetchAgentRunStatus,
  isLocalHostname,
  runStatusRefetchInterval,
  startAgentRun,
} from '@/integration/agentTrigger';

export type AgentRunPhase = 'idle' | 'starting' | 'running';

const RUN_STATUS_KEY = ['ai-wallet', 'agent-run', LOCAL_TRIGGER_URL] as const;

const LOCAL_DEV =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  isLocalHostname(window.location.hostname);

/**
 * Local dev only: follows `pnpm agent serve` step by step. The status is
 * polled every second while a run is in progress, so a reload picks the run
 * back up; nothing is polled while the agent is idle or not serving.
 */
export function useLocalAgentRun() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const status = useQuery({
    queryKey: RUN_STATUS_KEY,
    queryFn: () => fetchAgentRunStatus(LOCAL_TRIGGER_URL),
    enabled: LOCAL_DEV,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (query) => runStatusRefetchInterval(query.state.data),
  });

  const start = useMutation({
    mutationFn: () => startAgentRun(LOCAL_TRIGGER_URL),
    // Never re-send POST /runs: every accepted request spends real funds.
    retry: false,
    onSuccess: async ({ result, status: reported }) => {
      if (reported !== null) {
        // An older poll still in flight must not land on top of this answer.
        await queryClient.cancelQueries({ queryKey: RUN_STATUS_KEY });
        queryClient.setQueryData(RUN_STATUS_KEY, reported);
      } else if (result === 'started') {
        await queryClient.invalidateQueries({ queryKey: RUN_STATUS_KEY });
      }
      if (result === 'busy') {
        showToast({ type: 'info', title: 'A run is already in progress' });
      } else if (result === 'unreachable') {
        showToast({
          type: 'error',
          title: 'Start `pnpm agent serve` first',
        });
      }
    },
    onError: (error) => showToast({ type: 'error', title: error.message }),
  });

  const run = status.data ?? null;
  const previous = useRef<AgentRunStatus | null | undefined>(undefined);
  useEffect(() => {
    if (status.data === undefined) return;
    const before = previous.current;
    previous.current = status.data;
    if (before?.state !== 'running') return;
    const after = status.data;
    if (after === null || after.startedAt !== before.startedAt) {
      showToast({
        type: 'error',
        title:
          'Agent stopped mid-run — check the terminal and Basescan before running again',
      });
    } else if (after.state === 'succeeded') {
      void queryClient.invalidateQueries({
        queryKey: ['ai-wallet', 'transactions', AGENT_ADDRESS],
      });
    }
  }, [status.data, queryClient, showToast]);

  return {
    available: LOCAL_DEV,
    run,
    phase: runPhase(start.isPending, run),
    start: () => start.mutate(),
  };
}

function runPhase(
  starting: boolean,
  run: AgentRunStatus | null,
): AgentRunPhase {
  if (starting) return 'starting';
  return run?.state === 'running' ? 'running' : 'idle';
}
