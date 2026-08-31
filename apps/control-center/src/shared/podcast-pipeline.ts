export type PodcastPipelineStatus =
  | 'pending'
  | 'queued'
  | 'processing'
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

export interface PodcastPipelineEpisode {
  episodeId: string;
  title: string | null;
  sourceUrl: string;
  createdAt: string;
  currentPhase: PodcastPipelinePhase;
  translationStatus: PodcastPipelineStatus;
  ttsStatus: PodcastPipelineStatus;
  videoStatus: PodcastPipelineStatus;
  localizations: PodcastPipelineLocalization[];
  visual: PodcastPipelineJobState | null;
  renders: PodcastPipelineRenderState[];
  canRestartVideo: boolean;
}

export interface PodcastPipelineResponse {
  generatedAt: string;
  status: 'ok' | 'unconfigured' | 'error';
  message: string | null;
  episodes: PodcastPipelineEpisode[];
}
