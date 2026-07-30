import { describe, expect, it } from 'vitest';

import {
  composeEpisodeVideoProgress,
  type EpisodeVideoProgressJobState,
  RENDER_JOB_PROGRESS_STAGES,
  renderStageProgress,
  VISUAL_JOB_PROGRESS_STAGES,
  visualStageProgress,
} from './video-progress.js';

function jobState(
  overrides: Partial<EpisodeVideoProgressJobState> = {},
): EpisodeVideoProgressJobState {
  return {
    status: 'queued',
    progressPercent: null,
    progressStage: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('visualStageProgress', () => {
  it('reports the end of a stage when no fraction is supplied', () => {
    expect(visualStageProgress('analyzing-audio')).toEqual({
      percent: 5,
      stage: 'analyzing-audio',
    });
    expect(visualStageProgress('uploading-visuals')).toEqual({
      percent: 100,
      stage: 'uploading-visuals',
    });
  });

  it('interpolates a per-scene fraction inside the stage span', () => {
    expect(visualStageProgress('selecting-images', 0).percent).toBe(15);
    expect(visualStageProgress('selecting-images', 1 / 3).percent).toBe(40);
    expect(visualStageProgress('selecting-images', 1).percent).toBe(90);
  });

  it('clamps a fraction outside 0..1 to the stage boundaries', () => {
    expect(visualStageProgress('planning-scenes', -2).percent).toBe(5);
    expect(visualStageProgress('planning-scenes', 4).percent).toBe(15);
    expect(visualStageProgress('planning-scenes', Number.NaN).percent).toBe(5);
  });
});

describe('renderStageProgress', () => {
  it('gives the encode stage the widest span, since it is the longest step', () => {
    expect(renderStageProgress('encoding', 0).percent).toBe(35);
    expect(renderStageProgress('encoding', 0.5).percent).toBe(64);
    expect(renderStageProgress('encoding', 1).percent).toBe(92);
  });

  it('advances monotonically across the declared stage order', () => {
    const percents = RENDER_JOB_PROGRESS_STAGES.map(
      (stage) => renderStageProgress(stage).percent,
    );
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(percents.at(-1)).toBe(100);
  });
});

describe('composeEpisodeVideoProgress', () => {
  it('reports nothing when the localization has no render row', () => {
    expect(
      composeEpisodeVideoProgress({ render: null, visual: jobState() }),
    ).toEqual({ progressPercent: 0, stage: null, updatedAt: null });
  });

  it('reserves 100 for a completed render', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({
          status: 'completed',
          progressPercent: 100,
          progressStage: 'uploading-video',
          updatedAt: '2026-07-30T10:00:00Z',
        }),
        visual: jobState({ status: 'completed' }),
      }),
    ).toEqual({
      progressPercent: 100,
      stage: null,
      updatedAt: '2026-07-30T10:00:00Z',
    });
  });

  it('maps a processing render onto the upper 40-100 band', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({
          status: 'processing',
          progressPercent: 0,
          progressStage: 'analyzing-audio',
        }),
        visual: jobState({ status: 'completed' }),
      }).progressPercent,
    ).toBe(40);

    expect(
      composeEpisodeVideoProgress({
        render: jobState({
          status: 'processing',
          progressPercent: 64,
          progressStage: 'encoding',
        }),
        visual: jobState({ status: 'completed' }),
      }),
    ).toEqual({
      progressPercent: 78,
      stage: 'encoding',
      updatedAt: null,
    });
  });

  it('never reaches 100 while the render is still in flight', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({
          status: 'processing',
          progressPercent: 100,
          progressStage: 'uploading-video',
        }),
        visual: jobState({ status: 'completed' }),
      }).progressPercent,
    ).toBe(99);
  });

  it('surfaces the visual stage while the render row is still queued', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({ status: 'queued' }),
        visual: jobState({
          status: 'processing',
          progressPercent: 52,
          progressStage: 'selecting-images',
        }),
      }),
    ).toEqual({
      progressPercent: 22,
      stage: 'selecting-images',
      updatedAt: null,
    });
  });

  it('keeps the visual phase strictly below the visual-complete value', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({ status: 'queued' }),
        visual: jobState({
          status: 'processing',
          progressPercent: 100,
          progressStage: 'uploading-visuals',
        }),
      }).progressPercent,
    ).toBe(39);
  });

  it('parks at 40 once the visual checkpoint lands but no renderer has claimed the job', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({ status: 'queued' }),
        visual: jobState({ status: 'completed', progressPercent: 100 }),
      }),
    ).toEqual({
      progressPercent: 40,
      stage: 'waiting-for-renderer',
      updatedAt: null,
    });
  });

  it('reports the queued floor, not zero, while both jobs wait for a machine', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({
          status: 'queued',
          updatedAt: '2026-07-30T09:00:00Z',
        }),
        visual: jobState({ status: 'queued' }),
      }),
    ).toEqual({
      progressPercent: 2,
      stage: null,
      updatedAt: '2026-07-30T09:00:00Z',
    });
  });

  it('drops the stage label on failure but keeps the last known percentage', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({
          status: 'failed',
          progressPercent: 64,
          progressStage: 'encoding',
        }),
        visual: jobState({ status: 'completed' }),
      }),
    ).toEqual({ progressPercent: 78, stage: null, updatedAt: null });

    expect(
      composeEpisodeVideoProgress({
        render: jobState({ status: 'queued' }),
        visual: jobState({
          status: 'failed',
          progressPercent: 52,
          progressStage: 'selecting-images',
        }),
      }),
    ).toEqual({ progressPercent: 22, stage: null, updatedAt: null });
  });

  it('keeps the percentage when a newer worker stored an unrecognised stage', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({
          status: 'processing',
          progressPercent: 64,
          progressStage: 'transcoding-hdr',
        }),
        visual: jobState({ status: 'completed' }),
      }),
    ).toEqual({ progressPercent: 78, stage: null, updatedAt: null });
  });

  it('rejects a stage stored on the wrong job table', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({
          status: 'processing',
          progressPercent: 10,
          progressStage: 'selecting-images',
        }),
        visual: jobState({ status: 'completed' }),
      }).stage,
    ).toBeNull();
  });

  it('takes the newer timestamp when the visual row is the progress source', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({
          status: 'queued',
          updatedAt: '2026-07-30T09:00:00Z',
        }),
        visual: jobState({
          status: 'processing',
          progressPercent: 52,
          progressStage: 'selecting-images',
          updatedAt: '2026-07-30T09:30:00Z',
        }),
      }).updatedAt,
    ).toBe('2026-07-30T09:30:00Z');
  });

  it('ignores an unparseable timestamp instead of returning it', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({ status: 'queued', updatedAt: 'not-a-date' }),
        visual: jobState({
          status: 'processing',
          progressPercent: 52,
          updatedAt: '2026-07-30T09:30:00Z',
        }),
      }).updatedAt,
    ).toBe('2026-07-30T09:30:00Z');
  });

  it('treats a missing stored percentage as the start of its phase', () => {
    expect(
      composeEpisodeVideoProgress({
        render: jobState({ status: 'processing', progressPercent: null }),
        visual: jobState({ status: 'completed' }),
      }).progressPercent,
    ).toBe(40);
    expect(
      composeEpisodeVideoProgress({
        render: jobState({ status: 'queued' }),
        visual: jobState({ status: 'processing', progressPercent: null }),
      }).progressPercent,
    ).toBe(2);
  });

  it('stays within 0..99 for every stored percentage, including invalid ones', () => {
    const stored = [-50, 0, 37, 100, 250, Number.NaN, Number.POSITIVE_INFINITY];
    for (const progressPercent of stored) {
      for (const status of ['processing', 'failed'] as const) {
        const { progressPercent: composed } = composeEpisodeVideoProgress({
          render: jobState({ status, progressPercent }),
          visual: jobState({ status: 'completed' }),
        });
        expect(composed).toBeGreaterThanOrEqual(0);
        expect(composed).toBeLessThanOrEqual(99);
      }
    }
  });

  it('keeps the two stored stage whitelists disjoint apart from the shared step', () => {
    const shared = VISUAL_JOB_PROGRESS_STAGES.filter((stage) =>
      (RENDER_JOB_PROGRESS_STAGES as readonly string[]).includes(stage),
    );
    expect(shared).toEqual(['analyzing-audio']);
  });
});
