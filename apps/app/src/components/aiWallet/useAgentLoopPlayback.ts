import { useCallback, useEffect, useRef, useState } from 'react';

import { LOOP_REPLAY_STEP_MS } from '@/config/aiWalletDemo';
import {
  advanceAgentLoopPlayback,
  isNewDeposit,
  type AgentLoopPlayback,
  type DepositBaseline,
} from '@/integration/agentLoopModel';

/**
 * Steps the agent-loop timeline one row at a time. A replay is user-started;
 * a live run starts by itself when polling finds a deposit that was not there
 * on the first successful load.
 */
export function useAgentLoopPlayback({
  latestDepositHash,
  activityLoaded,
  stepCount,
}: {
  latestDepositHash: string | null;
  activityLoaded: boolean;
  stepCount: number;
}) {
  const [playback, setPlayback] = useState<AgentLoopPlayback | null>(null);
  const baseline = useRef<DepositBaseline>(undefined);

  useEffect(() => {
    if (!activityLoaded) return;
    const previous = baseline.current;
    baseline.current = { hash: latestDepositHash };
    if (isNewDeposit(previous, latestDepositHash)) {
      setPlayback({ mode: 'live', index: 0 });
    }
  }, [activityLoaded, latestDepositHash]);

  useEffect(() => {
    if (playback === null) return;
    const timer = setTimeout(() => {
      setPlayback((current) =>
        current === null ? null : advanceAgentLoopPlayback(current, stepCount),
      );
    }, LOOP_REPLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [playback, stepCount]);

  const replay = useCallback(() => {
    setPlayback({ mode: 'replay', index: 0 });
  }, []);

  return { playback, replay };
}
