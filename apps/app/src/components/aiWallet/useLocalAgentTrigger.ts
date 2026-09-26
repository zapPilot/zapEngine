import { useToast } from '@zapengine/app-core/providers/ToastContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { AGENT_ADDRESS, LOCAL_TRIGGER_URL } from '@/config/aiWalletDemo';
import { isLocalHostname, startAgentRun } from '@/integration/agentTrigger';

const FAST_POLL_MS = 3_000;
const FAST_POLL_LIMIT_MS = 3 * 60_000;

const LOCAL_DEV =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  isLocalHostname(window.location.hostname);

/**
 * Local dev only: asks `pnpm agent serve` for a real run, then polls
 * Blockscout fast until the new deposit lands, where the timeline's live
 * playback takes over.
 */
export function useLocalAgentTrigger(latestDepositHash: string | null) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  // The deposit hash at trigger time; `undefined` when no run is awaited.
  const [awaiting, setAwaiting] = useState<string | null | undefined>();

  const mutation = useMutation({
    mutationFn: () => startAgentRun(LOCAL_TRIGGER_URL),
    onSuccess: (result) => {
      if (result === 'started') {
        setAwaiting(latestDepositHash);
        showToast({ type: 'success', title: 'Agent run started' });
      } else if (result === 'busy') {
        showToast({ type: 'info', title: 'A run is already in progress' });
      } else {
        showToast({
          type: 'error',
          title: 'Start `pnpm agent serve` in apps/news-agent first',
        });
      }
    },
    onError: (error) => showToast({ type: 'error', title: error.message }),
  });

  const running = awaiting !== undefined && awaiting === latestDepositHash;

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > FAST_POLL_LIMIT_MS) {
        setAwaiting(undefined);
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ['ai-wallet', 'transactions', AGENT_ADDRESS],
      });
    }, FAST_POLL_MS);
    return () => clearInterval(timer);
  }, [running, queryClient]);

  return {
    available: LOCAL_DEV,
    busy: mutation.isPending || running,
    trigger: () => mutation.mutate(),
  };
}
