import { describe, expect, it } from 'vitest';

import {
  episodeVideoProgressView,
  videoGenerationStageLabel,
} from '@/integration/episodeVideoProgress';
import type {
  PodcastEpisode,
  PodcastVideoGenerationStage,
} from '@/integration/podcastFeed';

import { createPodcastVideoGeneration } from './support/podcastEpisode';

const READY_VIDEO = {
  url: 'https://cdn.example.com/video.mp4',
  thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
  durationSeconds: 90,
};

function generating(
  overrides: Parameters<typeof createPodcastVideoGeneration>[0] = {},
): Pick<PodcastEpisode, 'video' | 'videoGeneration'> {
  return {
    video: null,
    videoGeneration: createPodcastVideoGeneration(overrides),
  };
}

describe('videoGenerationStageLabel', () => {
  // Hard-coded rather than derived, so this doubles as a copy contract: a
  // renamed slug or a reworded label has to be an intentional edit here.
  const expected: [PodcastVideoGenerationStage, string][] = [
    ['analyzing-audio', 'Analyzing the audio'],
    ['planning-scenes', 'Planning the scenes'],
    ['selecting-images', 'Selecting images'],
    ['uploading-visuals', 'Saving the visuals'],
    ['waiting-for-renderer', 'Waiting for the renderer'],
    ['aligning-script', 'Aligning the script'],
    ['preparing-media', 'Preparing the scenes'],
    ['encoding', 'Encoding the video'],
    ['uploading-video', 'Uploading the video'],
  ];

  it.each(expected)('labels %s', (stage, label) => {
    expect(videoGenerationStageLabel(stage)).toBe(label);
  });

  it('has no label for an absent stage', () => {
    expect(videoGenerationStageLabel(null)).toBeNull();
  });
});

describe('episodeVideoProgressView', () => {
  it('shows a determinate bar during the shared visual phase', () => {
    // The render row is still 'queued' here: the slow image search runs on the
    // episode-scoped visual job. Gating on status would show a spinner instead.
    expect(
      episodeVideoProgressView(
        generating({
          status: 'queued',
          progressPercent: 22,
          stage: 'selecting-images',
        }),
      ),
    ).toEqual({ percent: 22, stageLabel: 'Selecting images' });
  });

  it('shows a determinate bar while this localization renders', () => {
    expect(
      episodeVideoProgressView(
        generating({
          status: 'processing',
          progressPercent: 78,
          stage: 'encoding',
        }),
      ),
    ).toEqual({ percent: 78, stageLabel: 'Encoding the video' });
  });

  it('treats 0% with a live stage as a legitimate determinate state', () => {
    // An empty track beside "Analyzing the audio" is honest; a spinner would
    // discard information the pipeline actually reported.
    expect(
      episodeVideoProgressView(
        generating({
          status: 'processing',
          progressPercent: 0,
          stage: 'analyzing-audio',
        }),
      ),
    ).toEqual({ percent: 0, stageLabel: 'Analyzing the audio' });
  });

  it('keeps the bar but drops the label for a stage this build does not know', () => {
    expect(
      episodeVideoProgressView({
        video: null,
        videoGeneration: {
          ...createPodcastVideoGeneration({
            status: 'processing',
            progressPercent: 55,
          }),
          // Only reachable from a newer server; the parser normally nulls this.
          stage: 'transcoding-hdr' as PodcastVideoGenerationStage,
        },
      }),
    ).toEqual({ percent: 55, stageLabel: null });
  });

  it('falls back to the indeterminate spinner when nothing is in flight', () => {
    expect(
      episodeVideoProgressView(generating({ status: 'queued' })),
    ).toBeNull();
  });

  it('falls back to the indeterminate spinner for a server without progress', () => {
    expect(
      episodeVideoProgressView(
        generating({
          status: 'processing',
          progressPercent: null,
          stage: 'encoding',
        }),
      ),
    ).toBeNull();
    expect(
      episodeVideoProgressView(
        generating({
          status: 'processing',
          progressPercent: 40,
          stage: null,
        }),
      ),
    ).toBeNull();
  });

  it('reports nothing for terminal states or a playable video', () => {
    expect(
      episodeVideoProgressView(
        generating({ status: 'completed', progressPercent: 100 }),
      ),
    ).toBeNull();
    expect(
      episodeVideoProgressView(
        generating({
          status: 'failed',
          progressPercent: 78,
          stage: 'encoding',
        }),
      ),
    ).toBeNull();
    expect(
      episodeVideoProgressView({ video: READY_VIDEO, videoGeneration: null }),
    ).toBeNull();
    expect(
      episodeVideoProgressView({ video: null, videoGeneration: null }),
    ).toBeNull();
  });
});
