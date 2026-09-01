import { describe, expect, it } from 'vitest';

import { summarizePodcastPipeline } from './podcast-pipeline.js';

const NOW = new Date('2026-09-01T00:00:00.000Z');
const episode = {
  id: '826f4b87-6278-4275-bff5-535ba5ef438d',
  source_title: 'From bananas to AI',
  source_url: 'https://example.com/article',
  created_at: '2026-08-31T15:54:10.000Z',
};

const localizations = (audio = true) =>
  (['zh-Hant', 'ja', 'en'] as const).map((language, index) => ({
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

const queuedRenders = () =>
  localizations().map((localization) => ({
    episode_localization_id: localization.id,
    episode_id: episode.id,
    status: 'queued',
    progress_percent: null,
    progress_stage: null,
    attempt_count: 0,
    lease_expires_at: null,
    last_error: null,
    updated_at: '2026-08-31T22:35:47.000Z',
  }));

function visual(overrides: Record<string, unknown>) {
  return {
    episode_id: episode.id,
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

function ingest(overrides: Record<string, unknown>) {
  return {
    source_url: episode.source_url,
    status: 'processing',
    attempt_count: 1,
    lease_expires_at: '2026-09-01T00:09:00.000Z',
    last_error: null,
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('podcast pipeline summary', () => {
  it('shows a terminal visual failure instead of pretending queued renders are still progressing', () => {
    const [summary] = summarizePodcastPipeline(
      [episode],
      [],
      localizations(),
      [
        visual({
          status: 'failed',
          progress_percent: 5,
          progress_stage: 'analyzing-audio',
          attempt_count: 3,
          last_error: 'Visual subject catalog failed',
        }),
      ],
      queuedRenders(),
      NOW,
    );

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
    const [summary] = summarizePodcastPipeline(
      [episode],
      [],
      localizations(),
      [
        visual({
          status: 'processing',
          progress_percent: 30,
          progress_stage: 'planning-scenes',
          attempt_count: 1,
          lease_expires_at: '2026-09-01T00:09:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
        }),
      ],
      queuedRenders(),
      new Date('2026-09-01T00:01:00.000Z'),
    );

    expect(summary).toMatchObject({
      currentPhase: 'video',
      videoStatus: 'processing',
      canRestartVideo: false,
    });
  });

  it('keeps an article in TTS until all three languages have renderable audio', () => {
    const [summary] = summarizePodcastPipeline(
      [episode],
      [],
      localizations(false),
      [],
      [],
      NOW,
    );

    expect(summary).toMatchObject({
      currentPhase: 'tts',
      translationStatus: 'completed',
      ttsStatus: 'processing',
      videoStatus: 'pending',
      canRestartVideo: false,
    });
  });

  it('surfaces a terminal ingest failure on the phase it actually blocked', () => {
    const incomplete = localizations(false).slice(0, 2);
    const [summary] = summarizePodcastPipeline(
      [episode],
      [
        ingest({
          status: 'failed',
          attempt_count: 3,
          lease_expires_at: null,
          last_error: 'translation provider failed',
        }),
      ],
      incomplete,
      [],
      [],
      NOW,
    );

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

  it('marks an expired ingest lease as stuck instead of indefinitely processing', () => {
    const [summary] = summarizePodcastPipeline(
      [episode],
      [
        ingest({
          lease_expires_at: '2026-08-31T23:59:00.000Z',
          last_error: 'Worker lease expired',
        }),
      ],
      [],
      [],
      [],
      NOW,
    );

    expect(summary).toMatchObject({
      currentPhase: 'translation',
      translationStatus: 'stuck',
      ingest: { status: 'stuck' },
    });
  });
});
