export type PodcastPipelineStatus =
  | 'pending'
  | 'unscheduled'
  | 'queued'
  | 'processing'
  | 'stuck'
  | 'stale'
  | 'completed'
  | 'failed';

export type PodcastPipelinePhase = 'translation' | 'tts' | 'video' | 'done';

export interface PodcastPipelineLocalization {
  languageCode: 'zh-Hant' | 'ja' | 'en';
  status: string;
  hasScript: boolean;
  hasAudio: boolean;
  updatedAt: string;
}

export interface PodcastPipelineIngestFailure {
  kind: 'failed' | 'lease_expired' | 'requeued';
  at: string;
  attempt: number;
  owner: string | null;
  error: string | null;
}

export interface PodcastPipelineJobState {
  status: PodcastPipelineStatus;
  progressPercent: number | null;
  stage: string | null;
  attempts: number;
  lastError: string | null;
  leaseExpiresAt: string | null;
  updatedAt: string | null;
  visualVersion?: string | null;
}

export interface PodcastPipelineIngestState extends PodcastPipelineJobState {
  failureHistory: PodcastPipelineIngestFailure[];
}

export interface PodcastPipelineRenderState extends PodcastPipelineJobState {
  languageCode: 'zh-Hant' | 'ja' | 'en';
  localizationId: string;
  canRestart: boolean;
}

export interface PodcastPipelineVisualQuery {
  sceneId: string;
  subjectIds: string[];
  selectionReason: string | null;
  queries: string[];
}

export interface PodcastPipelineVisualSearchAttempt {
  sceneId: string;
  provider: 'pexels' | 'pixabay' | 'brave';
  query: string;
  returned: number;
  accepted: number;
  entityFiltered: number;
  rejected: number;
}

export interface PodcastPipelineVisualDebug {
  phase: string | null;
  primarySubject: string | null;
  subjects: { id: string; name: string }[];
  plannedQueries: PodcastPipelineVisualQuery[];
  actualSearches: PodcastPipelineVisualSearchAttempt[];
}

export interface PodcastPipelineEpisode {
  episodeId: string;
  title: string | null;
  sourceUrl: string;
  createdAt: string;
  currentPhase: PodcastPipelinePhase;
  translationStatus: PodcastPipelineStatus;
  ttsStatus: PodcastPipelineStatus;
  videoStatus: PodcastPipelineStatus;
  ingest: PodcastPipelineIngestState | null;
  localizations: PodcastPipelineLocalization[];
  visual: PodcastPipelineJobState | null;
  /** Added by the visual-search debug rollout; optional for cached/older API fixtures. */
  visualDebug?: PodcastPipelineVisualDebug | null;
  renders: PodcastPipelineRenderState[];
  canRestartIngest: boolean;
  canRestartVideo: boolean;
  canForceReplanVisual: boolean;
}

export type PodcastPipelineRestartAction =
  | { step: 'ingest' }
  | { step: 'video'; forceReplan: boolean }
  | { step: 'render'; localizationId: string };

export interface PodcastPipelineResponse {
  generatedAt: string;
  status: 'ok' | 'unconfigured' | 'error';
  message: string | null;
  episodes: PodcastPipelineEpisode[];
}
