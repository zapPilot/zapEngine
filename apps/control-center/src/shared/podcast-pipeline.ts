export type PodcastPipelineStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'stuck'
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

export interface PodcastPipelineJobState {
  status: PodcastPipelineStatus;
  progressPercent: number | null;
  stage: string | null;
  attempts: number;
  lastError: string | null;
  leaseExpiresAt: string | null;
  updatedAt: string | null;
}

export interface PodcastPipelineRenderState extends PodcastPipelineJobState {
  languageCode: 'zh-Hant' | 'ja' | 'en';
  localizationId: string;
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
  ingest: PodcastPipelineJobState | null;
  localizations: PodcastPipelineLocalization[];
  visual: PodcastPipelineJobState | null;
  /** Added by the visual-search debug rollout; optional for cached/older API fixtures. */
  visualDebug?: PodcastPipelineVisualDebug | null;
  renders: PodcastPipelineRenderState[];
  canRestartVideo: boolean;
}

export interface PodcastPipelineResponse {
  generatedAt: string;
  status: 'ok' | 'unconfigured' | 'error';
  message: string | null;
  episodes: PodcastPipelineEpisode[];
}
