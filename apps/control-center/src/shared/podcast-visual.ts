import type {
  PodcastVideoReviewIssue,
  PodcastVideoReviewStatus,
  PodcastVideoReviewVerdict,
} from '@zapengine/types/shared';

export interface PodcastVisualSceneDebug {
  sceneId: string;
  sentenceText: string | null;
  imageSearchIntent: string[];
  imageSearchEntities: string[];
  subjectIds: string[];
  selectionReason: string | null;
  asset: {
    assetId: string;
    url: string | null;
    provider: string | null;
    license: string | null;
    sourcePageUrl: string | null;
    width: number | null;
    height: number | null;
    slideHeadline: string | null;
  } | null;
  trace: {
    provider: string;
    query: string;
    returned: number;
    accepted: number;
    entityFiltered: number;
    rejected: number;
  }[];
}

export interface PodcastVisualFailureDebug {
  stage: string | null;
  message: string | null;
  failedAt: string | null;
  attempt: number | null;
  raw: Record<string, unknown>;
}

export interface PodcastVideoReview {
  id: string;
  episodeId: string;
  visualHash: string | null;
  languageCode: string | null;
  sceneId: string | null;
  reviewer: 'operator' | 'agent';
  verdict: PodcastVideoReviewVerdict;
  issueCategories: PodcastVideoReviewIssue[];
  note: string | null;
  pipelineContext: Record<string, unknown>;
  status: PodcastVideoReviewStatus;
  resolutionNote: string | null;
  resolvedBy: 'operator' | 'agent' | null;
  createdAt: string;
  updatedAt: string;
}

export interface PodcastVideoReviewInput {
  visualHash?: string | null;
  languageCode?: 'zh-Hant' | 'ja' | 'en' | null;
  sceneId?: string | null;
  verdict: PodcastVideoReviewVerdict;
  issueCategories: PodcastVideoReviewIssue[];
  note?: string | null;
  pipelineContext?: Record<string, unknown>;
}

export interface PodcastVideoReviewResolveInput {
  status: 'triaged' | 'resolved';
  resolutionNote?: string | null;
}

export interface PodcastVisualDebugResponse {
  status: 'ok' | 'unconfigured' | 'error' | 'not-found';
  message: string | null;
  episode: { id: string; title: string | null; sourceUrl: string } | null;
  visual: {
    status: string;
    visualVersion: string | null;
    visualHash: string | null;
    attempts: number;
    lastError: string | null;
  } | null;
  renders: {
    languageCode: string;
    status: string;
    mp4Url: string | null;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
  }[];
  scenes: PodcastVisualSceneDebug[];
  failure: PodcastVisualFailureDebug | null;
  reviews: PodcastVideoReview[];
  rawPlan: Record<string, unknown> | null;
}
