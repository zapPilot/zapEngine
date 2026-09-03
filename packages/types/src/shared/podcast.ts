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
// image pools, and Brave as the relevance escalation path).
//
// It lives here rather than in the pipeline because it is a cross-app contract:
// both claim RPCs fence on it, so any surface that requeues video work has to
// stamp the same value or the work is written into a state no worker will ever
// claim. `@zapengine/podcast-pipeline` re-exports this as the value its workers
// pass; Control Center passes it when restarting an episode's video.
export const EPISODE_VIDEO_VISUAL_VERSION =
  'podcast-image-visual-plan.v9' as const;

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
