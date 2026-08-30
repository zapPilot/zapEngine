import {
  recordPipelineRun,
  RENDER_MACHINE_SHAPE,
  RENDER_PRICING_METRIC_KEY,
  videoRenderRunBase,
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
  const base = videoRenderRunBase({
    runRef: input.runRef,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    episodeId: input.episodeId,
  });
  const elapsedMs = Math.max(
    0,
    base.finishedAt.getTime() - input.startedAt.getTime(),
  );

  await recordPipelineRun({
    ...base,
    component: 'video-visual',
    stages: [
      {
        stage: 'video_render',
        provider: 'fly',
        status: input.status,
        episodeId: input.episodeId,
        attempt: input.attempt,
        startedAt: input.startedAt,
        finishedAt: base.finishedAt,
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
