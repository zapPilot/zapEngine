import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { describe, expect, it } from 'vitest';

import { summarizePodcastPipeline } from './podcast-pipeline.js';

const NOW = new Date('2026-09-01T00:00:00.000Z');
const episode = {
  id: '826f4b87-6278-4275-bff5-535ba5ef438d',
  source_title: 'From bananas to AI',
  source_url: 'https://example.com/article',
  created_at: '2026-08-31T15:54:10.000Z',
};

type SummaryArgs = Parameters<typeof summarizePodcastPipeline>;
type IngestRow = SummaryArgs[1][number];
type LocalizationRow = SummaryArgs[2][number];
type VisualRow = SummaryArgs[3][number];
type RenderRow = SummaryArgs[4][number];

function lifecycle(overrides: Record<string, unknown> = {}) {
  return {
    status: 'queued',
    progress_percent: null,
    progress_stage: null,
    attempt_count: 0,
    lease_expires_at: null,
    last_error: null,
    updated_at: '2026-08-31T22:49:35.000Z',
    ...overrides,
  };
}

function localizations(audio = true): LocalizationRow[] {
  return (['zh-Hant', 'ja', 'en'] as const).map((language, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    episode_id: episode.id,
    language_code: language,
    status: audio ? 'completed' : 'script_generated',
    script: `${language} script`,
    hls_url: audio ? `https://cdn.example.com/${language}.m3u8` : '',
    classroom_hls_url:
      language === 'zh-Hant' && audio
        ? 'https://cdn.example.com/classroom.m3u8'
        : null,
    updated_at: '2026-08-31T16:00:00.000Z',
  }));
}

function queuedRenders(): RenderRow[] {
  return localizations().map((localization) => ({
    ...lifecycle({ updated_at: '2026-08-31T22:35:47.000Z' }),
    episode_localization_id: localization.id,
    episode_id: episode.id,
  }));
}

function visual(overrides: Record<string, unknown> = {}): VisualRow {
  return {
    ...lifecycle(overrides),
    episode_id: episode.id,
  } as VisualRow;
}

function ingest(overrides: Record<string, unknown> = {}): IngestRow {
  return {
    ...lifecycle({
      status: 'processing',
      attempt_count: 1,
      lease_expires_at: '2026-09-01T00:09:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      ...overrides,
    }),
    source_url: episode.source_url,
  } as IngestRow;
}

function summarize(
  input: {
    ingests?: IngestRow[];
    localizationRows?: LocalizationRow[];
    visuals?: VisualRow[];
    renders?: RenderRow[];
    now?: Date;
  } = {},
) {
  return summarizePodcastPipeline(
    [episode],
    input.ingests ?? [],
    input.localizationRows ?? localizations(),
    input.visuals ?? [],
    input.renders ?? [],
    input.now ?? NOW,
  )[0];
}

function summarizeCompletedVisual(
  visualOverrides: Record<string, unknown> = {},
  renders: RenderRow[] = queuedRenders(),
) {
  return summarize({
    visuals: [
      visual({
        status: 'completed',
        visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        ...visualOverrides,
      }),
    ],
    renders,
  });
}

describe('podcast pipeline summary', () => {
  it('shows a terminal visual failure instead of pretending queued renders are still progressing', () => {
    const summary = summarize({
      visuals: [
        visual({
          status: 'failed',
          progress_percent: 5,
          progress_stage: 'analyzing-audio',
          attempt_count: 3,
          last_error: 'Visual subject catalog failed',
        }),
      ],
      renders: queuedRenders(),
    });

    expect(summary).toMatchObject({
      currentPhase: 'video',
      translationStatus: 'completed',
      ttsStatus: 'completed',
      videoStatus: 'failed',
      canRestartVideo: true,
      visual: {
        status: 'failed',
        attempts: 3,
        stage: 'analyzing-audio',
      },
    });
    expect(summary?.renders).toHaveLength(3);
    expect(summary?.renders.every(({ status }) => status === 'queued')).toBe(
      true,
    );
  });

  it('disables restart while a live visual lease owns the episode', () => {
    const summary = summarize({
      visuals: [
        visual({
          status: 'processing',
          progress_percent: 30,
          progress_stage: 'planning-scenes',
          attempt_count: 1,
          lease_expires_at: '2026-09-01T00:09:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
        }),
      ],
      renders: queuedRenders(),
      now: new Date('2026-09-01T00:01:00.000Z'),
    });

    expect(summary).toMatchObject({
      currentPhase: 'video',
      videoStatus: 'processing',
      canRestartVideo: false,
    });
  });

  it('reports languages without a render row as not scheduled and lets the RPC materialize them', () => {
    // Legacy single-language episodes and partial enqueues leave fewer than
    // three `episode_videos` rows. Since retry_episode_video_generation inserts
    // the missing rows, the operator can repair them with one restart.
    const summary = summarizeCompletedVisual({}, queuedRenders().slice(0, 1));

    expect(summary).toMatchObject({
      videoStatus: 'unscheduled',
      canRestartVideo: true,
    });
    expect(summary?.renders).toHaveLength(3);
    expect(
      summary?.renders.filter(({ status }) => status === 'unscheduled'),
    ).toHaveLength(2);
    expect(
      summary?.renders.filter(({ canRestart }) => canRestart),
    ).toHaveLength(3);
  });

  it('keeps an article in TTS until all three languages have renderable audio', () => {
    const summary = summarize({ localizationRows: localizations(false) });

    expect(summary).toMatchObject({
      currentPhase: 'tts',
      translationStatus: 'completed',
      ttsStatus: 'processing',
      videoStatus: 'pending',
      canRestartVideo: false,
    });
  });

  it('surfaces a terminal ingest failure on the phase it actually blocked', () => {
    const summary = summarize({
      ingests: [
        ingest({
          status: 'failed',
          attempt_count: 3,
          lease_expires_at: null,
          last_error: 'translation provider failed',
        }),
      ],
      localizationRows: localizations(false).slice(0, 2),
    });

    expect(summary).toMatchObject({
      currentPhase: 'translation',
      translationStatus: 'failed',
      ttsStatus: 'pending',
      ingest: {
        status: 'failed',
        attempts: 3,
        lastError: 'translation provider failed',
      },
    });
  });

  it('closes an abandoned episode instead of offering any restart', () => {
    const summary = summarize({
      visuals: [
        visual({
          status: 'failed',
          attempt_count: 3,
          last_error:
            'Scene alignment requires at least one localized sentence',
          abandoned_at: '2026-09-05T10:00:00.000Z',
          abandoned_reason: 'ja render cannot align; closed by operator',
        }),
      ],
      renders: queuedRenders(),
    });

    expect(summary).toMatchObject({
      currentPhase: 'done',
      videoStatus: 'abandoned',
      canRestartVideo: false,
      canForceReplanVisual: false,
      abandoned: {
        at: '2026-09-05T10:00:00.000Z',
        reason: 'ja render cannot align; closed by operator',
      },
    });
    expect(summary?.renders.every(({ canRestart }) => !canRestart)).toBe(true);
  });

  it('names an abandoned episode with no recorded reason rather than showing a blank', () => {
    const summary = summarizeCompletedVisual({
      abandoned_at: '2026-09-05T10:00:00.000Z',
      abandoned_reason: '   ',
    });

    expect(summary?.abandoned?.reason).toBe('No reason recorded');
  });

  it('behaves exactly as before when the abandon columns are absent', () => {
    // Control Center can deploy ahead of the migration, in which case the
    // per-episode abandon read is skipped and the rows carry neither column.
    const summary = summarizeCompletedVisual();

    expect(summary).toMatchObject({
      currentPhase: 'video',
      videoStatus: 'queued',
      canRestartVideo: true,
      canForceReplanVisual: true,
      abandoned: null,
    });
    expect(summary?.renders.every(({ canRestart }) => canRestart)).toBe(true);
  });

  it('marks an expired ingest lease as stuck instead of indefinitely processing', () => {
    const summary = summarize({
      ingests: [
        ingest({
          lease_expires_at: '2026-08-31T23:59:00.000Z',
          last_error: 'Worker lease expired',
        }),
      ],
      localizationRows: [],
    });

    expect(summary).toMatchObject({
      currentPhase: 'translation',
      translationStatus: 'stuck',
      ingest: { status: 'stuck' },
    });
  });
});
