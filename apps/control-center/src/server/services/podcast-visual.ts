import type {
  PodcastVideoReview,
  PodcastVideoReviewInput,
  PodcastVideoReviewIssue,
  PodcastVideoReviewResolveInput,
  PodcastVideoReviewStatus,
  PodcastVideoReviewVerdict,
  PodcastVisualDebugResponse,
  PodcastVisualFailureDebug,
  PodcastVisualSceneDebug,
} from '../../shared/podcast-visual.js';
import type { ControlCenterConfig } from '../config/env.js';
import { record, records, stringArray } from './json.js';
import {
  createConfiguredServiceRoleClient,
  isMissingColumnError,
  postgrestErrorCode,
} from './supabase.js';

interface ReviewRow {
  id: string;
  episode_id: string;
  visual_hash: string | null;
  language_code: string | null;
  scene_id: string | null;
  reviewer: string;
  verdict: string;
  issue_categories: string[];
  note: string | null;
  pipeline_context: Record<string, unknown>;
  status: string;
  resolution_note: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export function createPodcastVisualService(input: {
  config: ControlCenterConfig;
}) {
  const client = createConfiguredServiceRoleClient(input.config);

  return {
    async getVisualDebug(
      episodeId: string,
    ): Promise<PodcastVisualDebugResponse> {
      if (!client) {
        return unavailable('unconfigured', 'Supabase is not connected');
      }
      try {
        const [episodeResult, visualBaseResult, reviewsResult] =
          await Promise.all([
            client
              .from('episodes')
              .select('id,source_title,source_url')
              .eq('id', episodeId)
              .maybeSingle<{
                id: string;
                source_title: string | null;
                source_url: string;
              }>(),
            client
              .from('episode_video_visuals')
              .select(
                'episode_id,status,visual_version,visual_hash,attempt_count,last_error,visual_payload',
              )
              .eq('episode_id', episodeId)
              .maybeSingle<Record<string, unknown>>(),
            client
              .from('episode_video_reviews')
              .select('*')
              .eq('episode_id', episodeId)
              .order('created_at', { ascending: false })
              .limit(500),
          ]);
        if (episodeResult.error) {
          throw episodeResult.error;
        }
        if (!episodeResult.data) {
          return unavailable('not-found', 'Episode not found');
        }
        if (visualBaseResult.error) {
          throw visualBaseResult.error;
        }
        if (reviewsResult.error && !isMissingReviewTable(reviewsResult.error)) {
          throw reviewsResult.error;
        }

        let diagnostics: Record<string, unknown> | null = null;
        if (visualBaseResult.data) {
          const diagnosticsResult = await client
            .from('episode_video_visuals')
            .select('last_failure_diagnostics')
            .eq('episode_id', episodeId)
            .maybeSingle<{
              last_failure_diagnostics: Record<string, unknown> | null;
            }>();
          if (!diagnosticsResult.error) {
            diagnostics =
              diagnosticsResult.data?.last_failure_diagnostics ?? null;
          } else if (!isMissingColumnError(diagnosticsResult.error)) {
            throw diagnosticsResult.error;
          }
        }

        const visualRow = visualBaseResult.data;
        const payload = record(visualRow?.['visual_payload']) ?? null;

        return {
          status: 'ok',
          message: null,
          episode: {
            id: episodeResult.data.id,
            title: episodeResult.data.source_title,
            sourceUrl: episodeResult.data.source_url,
          },
          visual: visualRow
            ? {
                status: stringValue(visualRow['status']) ?? 'unknown',
                visualVersion: stringValue(visualRow['visual_version']),
                visualHash: stringValue(visualRow['visual_hash']),
                attempts: numberValue(visualRow['attempt_count']),
                lastError: stringValue(visualRow['last_error']),
              }
            : null,
          scenes: summarizeVisualPlan(payload),
          failure: summarizeVisualFailure(diagnostics),
          reviews: reviewsResult.error
            ? []
            : ((reviewsResult.data ?? []) as ReviewRow[]).map(mapReviewRow),
          rawPlan: payload,
        };
      } catch (cause) {
        return unavailable(
          'error',
          cause instanceof Error ? cause.message : 'Visual debug unavailable',
        );
      }
    },

    async upsertReview(
      episodeId: string,
      review: PodcastVideoReviewInput,
    ): Promise<PodcastVideoReview> {
      if (!client) {
        throw new Error('Supabase is not connected');
      }
      const { data, error } = await client.rpc('upsert_episode_video_review', {
        p_episode_id: episodeId,
        p_visual_hash: review.visualHash ?? null,
        p_language_code: review.languageCode ?? null,
        p_scene_id: review.sceneId ?? null,
        p_reviewer: 'operator',
        p_verdict: review.verdict,
        p_issue_categories: review.issueCategories,
        p_note: review.note ?? null,
        p_pipeline_context: review.pipelineContext ?? {},
      });
      if (error) {
        throw error;
      }
      const row = firstRpcRow<ReviewRow>(data);
      if (!row) {
        throw new Error('Review mutation returned no row');
      }
      return mapReviewRow(row);
    },

    async resolveReview(
      reviewId: string,
      input: PodcastVideoReviewResolveInput,
    ): Promise<boolean> {
      if (!client) {
        throw new Error('Supabase is not connected');
      }
      const { data, error } = await client.rpc('resolve_episode_video_review', {
        p_review_id: reviewId,
        p_status: input.status,
        p_resolution_note: input.resolutionNote ?? null,
        p_resolved_by: 'operator',
      });
      if (error) {
        throw error;
      }
      return data === true;
    },
  };
}

export function summarizeVisualPlan(
  payload: Record<string, unknown> | null,
): PodcastVisualSceneDebug[] {
  if (!payload) {
    return [];
  }
  const visualPlan = record(payload['visualPlan']);
  const provenance = record(payload['provenance']);
  const assignments = records(
    payload['sceneAssignments'] ?? provenance?.['sceneAssignments'],
  );
  const assignmentByScene = new Map(
    assignments.flatMap((row) => {
      const sceneId = stringValue(row['sceneId']);
      return sceneId ? [[sceneId, row] as const] : [];
    }),
  );
  const sentenceRows = records(provenance?.['sceneSentences']);
  const sentenceByScene = new Map(
    sentenceRows.flatMap((row) => {
      const sceneId = stringValue(row['sceneId']);
      const text = stringValue(row['text']);
      return sceneId ? [[sceneId, text] as const] : [];
    }),
  );
  const traceRows = records(
    provenance?.['searchTrace'] ?? payload['searchTrace'],
  );
  const traceByScene = new Map<string, PodcastVisualSceneDebug['trace']>();
  for (const row of traceRows) {
    const sceneId = stringValue(row['sceneId']);
    if (!sceneId) {
      continue;
    }
    const list = traceByScene.get(sceneId) ?? [];
    list.push({
      provider: stringValue(row['provider']) ?? 'unknown',
      query: stringValue(row['intent']) ?? '',
      returned: numberValue(row['returned']),
      accepted: numberValue(row['accepted']),
      entityFiltered: numberValue(row['entityFiltered']),
      rejected: numberValue(row['rejected']),
    });
    traceByScene.set(sceneId, list);
  }

  const selectionByScene = sceneSelectionsFrom(payload, provenance);

  const assets = records(payload['assets']);
  const assetByUrl = new Map(
    assets.flatMap((row) => {
      const r2Url = stringValue(row['r2Url']);
      return r2Url ? [[r2Url, row] as const] : [];
    }),
  );

  return records(visualPlan?.['scenes']).flatMap((scene) => {
    const sceneId = stringValue(scene['sceneId']);
    if (!sceneId) {
      return [];
    }
    const assignment = assignmentByScene.get(sceneId);
    const sceneAsset = record(scene['asset']);
    const r2Url = stringValue(sceneAsset?.['url']);
    const asset = r2Url ? assetByUrl.get(r2Url) : undefined;
    const assetId = stringValue(asset?.['assetId']);
    const slide = record(asset?.['slide']);
    const selection = selectionByScene.get(sceneId);
    return [
      {
        sceneId,
        sentenceText: sentenceByScene.get(sceneId) ?? null,
        imageSearchIntent: stringArray(scene['imageSearchIntent']),
        imageSearchEntities: stringArray(scene['imageSearchEntities']),
        subjectIds: stringArray(assignment?.['subjectIds']),
        selectionReason: stringValue(assignment?.['selectionReason']),
        asset: assetId
          ? {
              assetId,
              url: r2Url,
              provider: stringValue(asset?.['provider']),
              license: stringValue(asset?.['license']),
              sourcePageUrl: stringValue(asset?.['sourcePageUrl']),
              width: nullableNumber(asset?.['width']),
              height: nullableNumber(asset?.['height']),
              slideHeadline: stringValue(slide?.['headline']),
            }
          : null,
        trace: traceByScene.get(sceneId) ?? [],
        ...(selection ? { selection } : {}),
      },
    ];
  });
}

/**
 * The episode-wide Brave trace records each scene's outcome by subject key,
 * while the panel reads subject labels, so the scene rows are joined against
 * the requests that spent the budget.
 */
function sceneSelectionsFrom(
  payload: Record<string, unknown>,
  provenance: Record<string, unknown> | null,
): Map<string, NonNullable<PodcastVisualSceneDebug['selection']>> {
  const imageSearch = record(
    payload['imageSearch'] ?? provenance?.['imageSearch'],
  );
  const labelBySubjectKey = new Map<string, string>();
  for (const row of [
    ...records(imageSearch?.['primarySubjects']),
    ...records(imageSearch?.['requests']),
  ]) {
    const subjectKey = stringValue(row['subjectKey']);
    const label = stringValue(row['subjectLabel']);
    if (subjectKey && label) {
      labelBySubjectKey.set(subjectKey, label);
    }
  }
  const selections = new Map<
    string,
    NonNullable<PodcastVisualSceneDebug['selection']>
  >();
  for (const row of records(imageSearch?.['scenes'])) {
    const sceneId = stringValue(row['sceneId']);
    const selection = stringValue(row['selection']);
    if (!sceneId || !selection) {
      continue;
    }
    const matchedSubjectKey = stringValue(row['matchedSubjectKey']);
    selections.set(sceneId, {
      selection,
      matchedSubject: matchedSubjectKey
        ? (labelBySubjectKey.get(matchedSubjectKey) ?? matchedSubjectKey)
        : null,
      sourceQuery: stringValue(row['sourceQuery']),
      providerRank: nullableNumber(row['providerRank']),
      fallbackReason: stringValue(row['fallbackReason']),
    });
  }
  return selections;
}

export function summarizeVisualFailure(
  diagnostics: Record<string, unknown> | null,
): PodcastVisualFailureDebug | null {
  if (!diagnostics) {
    return null;
  }
  return {
    stage: stringValue(diagnostics['stage']),
    message: stringValue(diagnostics['message']),
    failedAt: stringValue(diagnostics['failedAt']),
    attempt: nullableNumber(diagnostics['attempt']),
    raw: diagnostics,
  };
}

export function mapReviewRow(row: ReviewRow): PodcastVideoReview {
  return {
    id: row.id,
    episodeId: row.episode_id,
    visualHash: row.visual_hash,
    languageCode: row.language_code,
    sceneId: row.scene_id,
    reviewer: row.reviewer === 'agent' ? 'agent' : 'operator',
    verdict: row.verdict as PodcastVideoReviewVerdict,
    issueCategories: row.issue_categories as PodcastVideoReviewIssue[],
    note: row.note,
    pipelineContext: row.pipeline_context ?? {},
    status: row.status as PodcastVideoReviewStatus,
    resolutionNote: row.resolution_note,
    resolvedBy:
      row.resolved_by === 'agent' || row.resolved_by === 'operator'
        ? row.resolved_by
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function unavailable(
  status: 'unconfigured' | 'error' | 'not-found',
  message: string,
): PodcastVisualDebugResponse {
  return {
    status,
    message,
    episode: null,
    visual: null,
    scenes: [],
    failure: null,
    reviews: [],
    rawPlan: null,
  };
}

function firstRpcRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] as T | undefined) ?? null;
  }
  return data && typeof data === 'object' ? (data as T) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isMissingReviewTable(error: unknown): boolean {
  const code = postgrestErrorCode(error);
  return code === '42P01' || code === 'PGRST205';
}
