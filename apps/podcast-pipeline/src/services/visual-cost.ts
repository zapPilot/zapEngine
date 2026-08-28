import { randomUUID } from 'node:crypto';

import {
  recordPipelineRun,
  RENDER_MACHINE_SHAPE,
  RENDER_PRICING_METRIC_KEY,
} from './ops-ledger.js';

export interface VisualPipelineCostInput {
  episodeId: string;
  runRef: string;
  attempt: number;
  status: 'completed' | 'failed';
  startedAt: Date;
  finishedAt?: Date;
}

/**
 * Attribute the shared storyboard/search/image work to the episode that caused
 * it. This is Fly compute, not an invoice reconstruction: shared app uptime,
 * stopped-machine storage and network charges remain in the monthly provider
 * ledger instead of being allocated to episodes.
 */
export async function recordVisualPipelineCost(
  input: VisualPipelineCostInput,
): Promise<void> {
  const finishedAt = input.finishedAt ?? new Date();
  const elapsedMs = Math.max(
    0,
    finishedAt.getTime() - input.startedAt.getTime(),
  );

  await recordPipelineRun({
    runId: randomUUID(),
    pipeline: 'video_render',
    runRef: input.runRef,
    trigger: 'worker',
    status: input.status,
    startedAt: input.startedAt,
    finishedAt,
    episodeId: input.episodeId,
    component: 'video-visual',
    stages: [
      {
        stage: 'video_render',
        provider: 'fly',
        status: input.status,
        episodeId: input.episodeId,
        attempt: input.attempt,
        startedAt: input.startedAt,
        finishedAt,
        elapsedMs,
        usage: {
          machine: RENDER_MACHINE_SHAPE,
          work: 'shared_visual',
        },
        pricing: {
          metricKey: RENDER_PRICING_METRIC_KEY,
          quantity: elapsedMs / 1_000,
        },
      },
    ],
  });
}
