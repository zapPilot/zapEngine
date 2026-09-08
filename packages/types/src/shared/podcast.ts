/**
 * The three languages every canonical podcast episode is produced in. Order
 * is source-language-first (`zh-Hant`), matching how the pipeline localizes:
 * script -> translation targets.
 */
export const PODCAST_LANGUAGE_CODES = ['zh-Hant', 'ja', 'en'] as const;

export type PodcastLanguageCode = (typeof PODCAST_LANGUAGE_CODES)[number];

export const DEFAULT_PODCAST_LANGUAGE_CODE: PodcastLanguageCode = 'zh-Hant';

export function isPodcastLanguageCode(
  value: string,
): value is PodcastLanguageCode {
  return (PODCAST_LANGUAGE_CODES as readonly string[]).includes(value);
}

export interface PodcastLanguageLabel {
  /** English name of the language, used in LLM prompts (e.g. translation instructions). */
  english: string;
  /** Name of the language written in itself. */
  native: string;
  /** Compact badge for a language chip/pill. */
  badge: string;
  /** BCP-47 locale for `Intl` formatters. */
  intlLocale: string;
}

export const PODCAST_LANGUAGE_LABELS: Record<
  PodcastLanguageCode,
  PodcastLanguageLabel
> = {
  'zh-Hant': {
    english: 'Traditional Chinese',
    native: '繁體中文',
    badge: '中',
    intlLocale: 'zh-TW',
  },
  ja: {
    english: 'Japanese',
    native: '日本語',
    badge: '日',
    intlLocale: 'ja-JP',
  },
  en: {
    english: 'English',
    native: 'English',
    badge: 'EN',
    intlLocale: 'en-US',
  },
};

/** Stages the shared episode-wide visual job can report. */
export const PODCAST_VIDEO_VISUAL_STAGES = [
  'analyzing-audio',
  'planning-scenes',
  'selecting-images',
  'uploading-visuals',
] as const;

export type PodcastVideoVisualStage =
  (typeof PODCAST_VIDEO_VISUAL_STAGES)[number];

/** Stages a single per-language render job can report. */
export const PODCAST_VIDEO_RENDER_STAGES = [
  'analyzing-audio',
  'aligning-script',
  'preparing-media',
  'encoding',
  'uploading-video',
] as const;

export type PodcastVideoRenderStage =
  (typeof PODCAST_VIDEO_RENDER_STAGES)[number];

/**
 * The full stage vocabulary a client can see across both jobs, in the order a
 * localization moves through them. `waiting-for-renderer` is derived by
 * readers (the gap between a completed visual checkpoint and a render job
 * picking the work up) and is never itself stored on either job.
 */
export const PODCAST_VIDEO_PROGRESS_STAGES = [
  'analyzing-audio',
  'planning-scenes',
  'selecting-images',
  'uploading-visuals',
  'waiting-for-renderer',
  'aligning-script',
  'preparing-media',
  'encoding',
  'uploading-video',
] as const;

export type PodcastVideoProgressStage =
  (typeof PODCAST_VIDEO_PROGRESS_STAGES)[number];

// This is the queue compatibility fence for the whole video pipeline, not only
// image selection. Bump it when a completed render must be regenerated under a
// new output contract (v4: 720x1280 at 24fps; v5: LLM-written search intents
// and the chunk-crossfade freeze fix; v6: cover + body + Zap Pilot outro,
// BODY ONLY storyboard, intro extends first body; v7: per-scene fail-closed
// entity-first LLM search intents, Brave image retrieval, and an
// entity-anchored candidate gate; v8: episode-wide subject catalog, primary
// lead fencing, contextual subject fallback, persisted editorial decisions,
// and restrained presentation metadata; v9: publisher-title lead identity,
// publisher-image body reuse, free-first entity-gated search, bounded subject
// image pools, and Brave as the relevance escalation path; v10: portrait
// images are always shown whole with dark padding, zero editorial zoom, safe
// drift, and short directional transitions).
//
// It lives here rather than in the pipeline because it is a cross-app contract:
// both claim RPCs fence on it, so any surface that requeues video work has to
// stamp the same value or the work is written into a state no worker will ever
// claim. `@zapengine/podcast-pipeline` re-exports this as the value its workers
// pass; Control Center passes it when restarting an episode's video.
export const EPISODE_VIDEO_VISUAL_VERSION =
  'podcast-image-visual-plan.v10' as const;

export const PODCAST_VIDEO_REVIEW_VERDICTS = [
  'good',
  'acceptable',
  'bad',
] as const;

export const PODCAST_VIDEO_REVIEW_ISSUES = [
  'wrong-subject',
  'irrelevant-stock',
  'text-heavy',
  'low-quality',
  'repeated-image',
  'abstract-no-image',
  'caption-timing',
  'thumbnail',
  'audio',
  'other',
] as const;

export const PODCAST_VIDEO_REVIEW_STATUSES = [
  'open',
  'triaged',
  'resolved',
] as const;
