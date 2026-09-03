import type {
  PODCAST_VIDEO_REVIEW_ISSUES,
  PODCAST_VIDEO_REVIEW_STATUSES,
  PODCAST_VIDEO_REVIEW_VERDICTS,
} from '@zapengine/types/shared';

// `@zapengine/types/shared` exports the vocabulary tuples only; both apps
// derive the unions locally so the shared package never carries type-only
// exports that its dead-code gate cannot trace across workspaces.
export type PodcastVideoReviewVerdict =
  (typeof PODCAST_VIDEO_REVIEW_VERDICTS)[number];
export type PodcastVideoReviewIssue =
  (typeof PODCAST_VIDEO_REVIEW_ISSUES)[number];
export type PodcastVideoReviewStatus =
  (typeof PODCAST_VIDEO_REVIEW_STATUSES)[number];

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

/** Callbacks the pipeline view threads down to every episode card and panel. */
export interface PodcastVisualReviewHandlers {
  onLoadVisualDebug: (episodeId: string) => Promise<PodcastVisualDebugResponse>;
  onSubmitReview: (
    episodeId: string,
    review: PodcastVideoReviewInput,
  ) => Promise<void>;
  onResolveReview: (
    episodeId: string,
    reviewId: string,
    input: PodcastVideoReviewResolveInput,
  ) => Promise<void>;
}
