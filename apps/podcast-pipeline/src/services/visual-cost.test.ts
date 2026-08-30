import { beforeEach, describe, expect, it, vi } from 'vitest';

const ledger = vi.hoisted(() => ({ recordPipelineRun: vi.fn() }));

vi.mock('./ops-ledger.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    recordPipelineRun: ledger.recordPipelineRun,
  };
});

import { recordVisualPipelineCost } from './visual-cost.js';

beforeEach(() => {
  vi.clearAllMocks();
  ledger.recordPipelineRun.mockResolvedValue(undefined);
});

describe('recordVisualPipelineCost', () => {
  it('prices the shared visual wall time against the Fly render rate', async () => {
    await recordVisualPipelineCost({
      episodeId: 'episode-1',
      runRef: 'abcd1234',
      attempt: 2,
      status: 'failed',
      startedAt: new Date('2026-08-28T01:00:00.000Z'),
      finishedAt: new Date('2026-08-28T01:02:30.000Z'),
    });

    expect(ledger.recordPipelineRun).toHaveBeenCalledWith(
      expect.objectContaining({
        pipeline: 'video_render',
        runRef: 'abcd1234',
        episodeId: 'episode-1',
        status: 'failed',
        component: 'video-visual',
        stages: [
          expect.objectContaining({
            stage: 'video_render',
            provider: 'fly',
            status: 'failed',
            attempt: 2,
            elapsedMs: 150_000,
            usage: {
              machine: 'performance-2x-4gb',
              work: 'shared_visual',
            },
            pricing: {
              metricKey: 'machine_second_performance_2x_4gb',
              quantity: 150,
            },
          }),
        ],
      }),
    );
  });
});
