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

export interface PipelineQueueItem {
  key: string;
  kind: PipelineQueueKind;
  episodeId: string;
  title: string;
  languageCode?: string;
  state: PipelineQueueState;
  queuedAt?: string;
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
}

export interface PipelineQueueSummary {
  queueDepth: number;
  processing: number;
  blockedOrFailed: number;
  publishedToday: number;
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
