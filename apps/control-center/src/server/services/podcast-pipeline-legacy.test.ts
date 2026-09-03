import { describe, expect, it } from 'vitest';

import { summarizePodcastPipeline } from './podcast-pipeline.js';

const NOW = new Date('2026-09-03T01:30:00.000Z');
const episode = {
  id: '57eef03a-95d0-46a9-bf6b-aaf434c0b541',
  source_title: 'AI下一個類 Coding 的大場景在哪？',
  source_url: 'https://example.com/article',
  created_at: '2026-08-28T09:22:31.000Z',
};

const canonical = {
  id: '00000000-0000-4000-8000-000000000001',
  episode_id: episode.id,
  language_code: 'zh-Hant',
  status: 'completed',
  script: 'canonical script',
  hls_url: 'https://cdn.example.com/zh-Hant.m3u8',
  classroom_hls_url: 'https://cdn.example.com/classroom.m3u8',
  updated_at: '2026-08-28T09:58:12.000Z',
};

const pendingJapanese = {
  id: '00000000-0000-4000-8000-000000000002',
  episode_id: episode.id,
  language_code: 'ja',
  status: 'pending',
  script: '',
  hls_url: '',
  classroom_hls_url: null,
  updated_at: '2026-08-28T09:58:14.000Z',
};

const historicalFailure = {
  episode_id: episode.id,
  status: 'failed',
  finished_at: '2026-08-28T10:02:15.000Z',
  created_at: '2026-08-28T10:02:15.000Z',
};

describe('legacy podcast ingest state', () => {
  it('uses the historical failed run instead of showing an orphan as processing forever', () => {
    const [summary] = summarizePodcastPipeline(
      [episode],
      [],
      [canonical, pendingJapanese],
      [],
      [],
      NOW,
      [historicalFailure],
    );

    expect(summary).toMatchObject({
      currentPhase: 'translation',
      translationStatus: 'failed',
      ttsStatus: 'pending',
      canRestartIngest: true,
      ingest: {
        status: 'failed',
        updatedAt: '2026-08-28T10:02:15.000Z',
      },
    });
  });

  it('prefers a live durable job over the historical failed run', () => {
    const [summary] = summarizePodcastPipeline(
      [episode],
      [
        {
          source_url: episode.source_url,
          status: 'processing',
          attempt_count: 1,
          lease_expires_at: '2026-09-03T01:35:00.000Z',
          last_error: null,
          updated_at: '2026-09-03T01:29:00.000Z',
        },
      ],
      [canonical, pendingJapanese],
      [],
      [],
      NOW,
      [historicalFailure],
    );

    expect(summary).toMatchObject({
      translationStatus: 'processing',
      canRestartIngest: false,
      ingest: { status: 'processing', attempts: 1 },
    });
  });
});
