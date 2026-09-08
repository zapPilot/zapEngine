import type { PodcastPipelineRestartAction } from './podcast-pipeline.js';

export type PipelineQueueState =
  | 'processing'
  | 'queued'
  | 'retrying'
  | 'blocked'
  | 'failed'
  | 'completed';

export type PipelineQueueKind = 'ingest' | 'visual' | 'render';

export interface PipelineQueueHistoryEvent {
  at: string;
  label: string;
  detail?: string;
}

export interface PipelinePublishedLink {
  platform: SocialPlatform;
  languageCode: string;
  publishedAt: string;
  url: string | null;
}

/**
 * What an operator may do to this exact job, decided server-side. The episode
 * read model only covers the 40 most recent episodes, so a client-side join
 * would leave the oldest stuck jobs — the ones most in need of a retry — with no
 * button at all.
 */
export interface PipelineQueueItemActions {
  restart?: PodcastPipelineRestartAction;
  /** Why no restart is offered. Rendered next to the absent button. */
  disabledReason?: string;
}

export interface PipelineQueueItem {
  key: string;
  kind: PipelineQueueKind;
  episodeId?: string;
  sourceUrl?: string;
  title: string;
  languageCode?: string;
  state: PipelineQueueState;
  queuedAt?: string;
  nextAttemptAt?: string;
  startedAt?: string;
  updatedAt?: string;
  workerId?: string;
  currentStep?: string;
  progressPercent?: number;
  retryCount: number;
  lastError?: string;
  thumbnailUrl?: string;
  history: PipelineQueueHistoryEvent[];
  publishedLinks: PipelinePublishedLink[];
  actions: PipelineQueueItemActions;
  /**
   * Set once an operator closed this episode's video work for good. The row
   * keeps whatever state it died in; this only says nobody should restart it,
   * which is why such items leave the attention lane entirely.
   */
  abandoned?: { at: string; reason: string };
}

export type SocialPlatform = 'x' | 'threads' | 'rednote' | 'youtube';

export type SocialPublishStatus =
  | 'scheduled'
  | 'queued'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped';

export type SocialQueueState =
  | 'queued'
  | 'publishing'
  | 'published'
  | 'partial'
  | 'failed';

export interface SocialPlatformQueueState {
  platform: SocialPlatform;
  languageCode: string;
  status: SocialPublishStatus;
  scheduledAt: string;
  nextAttemptAt?: string;
  publishedAt?: string;
  url?: string;
  workerId?: string;
  error?: string;
  retryCount: number;
}

export interface SocialQueueItem {
  key: string;
  episodeId: string;
  title: string;
  contentType: 'video';
  scheduledAt: string;
  state: SocialQueueState;
  platforms: SocialPlatformQueueState[];
  history: PipelineQueueHistoryEvent[];
  publishedLinks: PipelinePublishedLink[];
}

export interface PipelineQueueLane<T> {
  processing: T[];
  queued: T[];
  attention: T[];
  /** Only the render lane carries this; abandonment is a video-pipeline marker. */
  abandoned?: T[];
}

export interface PipelineQueueSummary {
  queueDepth: number;
  processing: number;
  blockedOrFailed: number;
  publishedToday: number;
  abandoned: number;
}

export interface PipelineQueuesResponse {
  generatedAt: string;
  status: 'ok' | 'unconfigured' | 'error';
  message: string | null;
  summary: PipelineQueueSummary;
  api: PipelineQueueLane<PipelineQueueItem>;
  render: PipelineQueueLane<PipelineQueueItem>;
  social: PipelineQueueLane<SocialQueueItem>;
}
