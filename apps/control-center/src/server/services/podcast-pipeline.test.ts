import { describe, expect, it } from 'vitest';

import { summarizePodcastPipeline } from './podcast-pipeline.js';

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

describe('podcast pipeline summary', () => {
  it('shows a terminal visual failure instead of pretending queued renders are still progressing', () => {
    const [summary] = summarizePodcastPipeline(
      [episode],
      localizations(),
      [
        {
          episode_id: episode.id,
          status: 'failed',
          progress_percent: 5,
          progress_stage: 'analyzing-audio',
          attempt_count: 3,
          lease_expires_at: null,
          last_error: 'Visual subject catalog failed',
          updated_at: '2026-08-31T22:49:35.000Z',
        },
      ],
      queuedRenders(),
      new Date('2026-09-01T00:00:00.000Z'),
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
      localizations(),
      [
        {
          episode_id: episode.id,
          status: 'processing',
          progress_percent: 30,
          progress_stage: 'planning-scenes',
          attempt_count: 1,
          lease_expires_at: '2026-09-01T00:09:00.000Z',
          last_error: null,
          updated_at: '2026-09-01T00:00:00.000Z',
        },
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
      localizations(false),
      [],
      [],
      new Date('2026-09-01T00:00:00.000Z'),
    );

    expect(summary).toMatchObject({
      currentPhase: 'tts',
      translationStatus: 'completed',
      ttsStatus: 'processing',
      videoStatus: 'pending',
      canRestartVideo: false,
    });
  });
});
