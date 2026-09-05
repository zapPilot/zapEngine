export type PodcastPipelineStatus =
  | 'pending'
  | 'unscheduled'
  | 'queued'
  | 'processing'
  | 'stuck'
  | 'stale'
  | 'completed'
  | 'failed'
  | 'abandoned';

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

/**
 * One result the provider returned, in the order it returned it. Counts alone
 * could say a request returned 100 and kept 13; only the results themselves say
 * what the other 87 were, which is the first question a wrong image raises.
 */
export interface PodcastPipelineVisualSearchCandidate {
  imageUrl: string;
  sourceUrl: string;
  altText: string | null;
  providerRank: number;
  dropReason: string | null;
  /** The scene that ended up with this exact result, joined through the scene
   * selection's own query and provider rank. Null for every other candidate. */
  selectedBySceneId: string | null;
}

/**
 * One Brave request. `sceneId` is null for the episode-wide primary searches
 * that build the candidate pool before any scene owns an image, so the panel
 * lists requests by subject rather than by scene.
 */
export interface PodcastPipelineVisualSearchAttempt {
  sceneId: string | null;
  provider: string;
  kind: 'primary' | 'targeted' | null;
  subjectLabel: string | null;
  query: string;
  returned: number;
  viable: number;
  drops: { reason: string; count: number }[];
  /** Empty for a request recorded before candidates were traced, and for a
   * request that failed before the provider answered. */
  candidates: PodcastPipelineVisualSearchCandidate[];
  error: string | null;
}

/** What the episode spent against its per-episode Brave ceiling. A weak-looking
 * video is as often budget-starved as mis-searched, so the counts lead. */
export interface PodcastPipelineVisualBudget {
  requestCount: number;
  max: number;
  primary: number;
  targeted: number;
  exhausted: boolean;
}

export interface PodcastPipelineVisualSubjectSearch {
  label: string;
  query: string;
}

export interface PodcastPipelineVisualSceneSelection {
  sceneId: string;
  selection: string;
  fallbackReason: string | null;
  matchedSubjectKey: string | null;
  sourceQuery: string | null;
  providerRank: number | null;
}

export interface PodcastPipelineVisualReuse {
  assetId: string;
  useCount: number;
}

export interface PodcastPipelineVisualDebug {
  phase: string | null;
  primarySubject: string | null;
  subjects: { id: string; name: string }[];
  /** Why the catalog is empty. A bad model answer degrades to no catalog rather
   * than failing the video, so an empty `subjects` otherwise reads the same as
   * an episode whose scenes genuinely name nobody. */
  subjectCatalogFailure: string | null;
  budget: PodcastPipelineVisualBudget | null;
  primarySubjects: PodcastPipelineVisualSubjectSearch[];
  plannedSubjectSearches: PodcastPipelineVisualSubjectSearch[];
  plannedQueries: PodcastPipelineVisualQuery[];
  actualSearches: PodcastPipelineVisualSearchAttempt[];
  sceneSelections: PodcastPipelineVisualSceneSelection[];
  reuse: PodcastPipelineVisualReuse[];
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
  renders: PodcastPipelineRenderState[];
  canRestartIngest: boolean;
  canRestartVideo: boolean;
  /**
   * Set once an operator closes an episode's video work for good. It is
   * derived, not a lifecycle status: the underlying rows keep whatever state
   * they died in, and this only says nobody should restart them.
   */
  abandoned?: { at: string; reason: string } | null;
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
