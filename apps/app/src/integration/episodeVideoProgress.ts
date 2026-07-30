import type {
  PodcastEpisode,
  PodcastVideoGenerationStage,
} from '@/integration/podcastFeed';

/**
 * A `Record` rather than a `switch`, so adding a stage to the union without a
 * label is a compile error rather than a blank line in the UI.
 */
const VIDEO_GENERATION_STAGE_LABELS: Record<
  PodcastVideoGenerationStage,
  string
> = {
  'analyzing-audio': 'Analyzing the audio',
  'planning-scenes': 'Planning the scenes',
  'selecting-images': 'Selecting images',
  'uploading-visuals': 'Saving the visuals',
  'waiting-for-renderer': 'Waiting for the renderer',
  'aligning-script': 'Aligning the script',
  'preparing-media': 'Preparing the scenes',
  encoding: 'Encoding the video',
  'uploading-video': 'Uploading the video',
};

export interface EpisodeVideoProgressView {
  /** 0-100, already clamped by the feed parser. */
  percent: number;
  /** Null when the stage is absent or unknown to this build. */
  stageLabel: string | null;
}

export function videoGenerationStageLabel(
  stage: PodcastVideoGenerationStage | null,
): string | null {
  if (stage === null) return null;
  // A Record lookup is `string` to TypeScript but `undefined` at runtime for a
  // key outside the union, which a newer server can still deliver. Normalize, or
  // the caller renders the word "undefined".
  return VIDEO_GENERATION_STAGE_LABELS[stage] ?? null;
}

/**
 * The payload for a determinate progress bar, or `null` to fall back to the
 * indeterminate spinner.
 *
 * The gate is `stage`, not `status`. Image selection runs on an episode-scoped
 * job shared by all three languages, and this localization's own render row
 * stays `queued` for that whole time — gating on `status === 'processing'` would
 * show a spinner through the slowest part of the wait, which is the one stretch
 * the bar exists for.
 */
export function episodeVideoProgressView(
  episode: Pick<PodcastEpisode, 'video' | 'videoGeneration'>,
): EpisodeVideoProgressView | null {
  if (episode.video !== null) return null;

  const generation = episode.videoGeneration;
  if (generation === null) return null;
  if (generation.status === 'completed' || generation.status === 'failed') {
    return null;
  }
  if (generation.stage === null || generation.progressPercent === null) {
    return null;
  }

  return {
    percent: generation.progressPercent,
    stageLabel: videoGenerationStageLabel(generation.stage),
  };
}
