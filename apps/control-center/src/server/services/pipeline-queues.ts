import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';

import type {
  PipelinePublishedLink,
  PipelineQueueHistoryEvent,
  PipelineQueueItem,
  PipelineQueueItemActions,
  PipelineQueueLane,
  PipelineQueuesResponse,
  SocialPlatform,
  SocialPlatformQueueState,
  SocialPublishStatus,
  SocialQueueItem,
  SocialQueueState,
} from '../../shared/pipeline-queues.js';
import type { ControlCenterConfig } from '../config/env.js';
import {
  leaseIsActive,
  visualIsRenderable,
} from './podcast-retry-eligibility.js';
import { createConfiguredServiceRoleClient } from './supabase.js';

const ACTIVE_STATUSES = ['queued', 'processing', 'failed'] as const;
const READ_LIMIT = 200;

type MaybeError<T> = { data: T | null; error: unknown };

interface EpisodeRow {
  id: string;
  source_title: string | null;
  source_url: string;
  created_at: string;
}

interface LocalizationRow {
  id: string;
  episode_id: string;
  language_code: string;
  script: string | null;
  hls_url: string;
  classroom_hls_url: string | null;
  status: string;
  updated_at: string;
}

/**
 * Every visual row for the episodes on the board, at any status — the active
 * read only carries queued/processing/failed, but a render's retry eligibility
 * and an episode's abandonment both hang off a visual that is usually
 * `completed`.
 */
interface VisualStateRow {
  episode_id: string;
  status: string;
  visual_version: string | null;
  abandoned_at: string | null;
  abandoned_reason: string | null;
}

interface IngestRow {
  id: string;
  source_url: string;
  language_code: string;
  status: string;
  attempt_count: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface VideoWorkRow {
  episode_id: string;
  status: string;
  visual_version: string | null;
  progress_percent: number | null;
  progress_stage: string | null;
  attempt_count: number;
  next_attempt_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RenderRow extends VideoWorkRow {
  episode_localization_id: string;
  thumbnail_url: string | null;
}

interface SocialJobRow {
  id: string;
  episode_id: string;
  platform: string;
  language_code: string;
  status: string;
  scheduled_at: string;
  next_attempt_at: string;
  attempt_count: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SocialPostRow {
  id: string;
  episode_id: string;
  platform: string;
  language_code: string;
  post_url: string | null;
  published_at: string;
}

interface WorkItemInput {
  key: string;
  kind: PipelineQueueItem['kind'];
  title: string;
  episodeId?: string;
  sourceUrl?: string;
  languageCode?: string;
  status: string;
  visualVersion?: string | null;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastError: string | null;
  queuedAt: string;
  nextAttemptAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
  currentStep: string;
  progressPercent?: number | null;
  thumbnailUrl?: string | null;
  now: Date;
  posts: SocialPostRow[];
  localizationId?: string;
  visualState?: VisualStateRow | undefined;
  videoPrereqsReady?: boolean;
}

export function createPipelineQueuesService(input: {
  config: ControlCenterConfig;
  now?: () => Date;
}) {
  const client = createConfiguredServiceRoleClient(input.config);
  const now = input.now ?? (() => new Date());

  return {
    async getQueues(): Promise<PipelineQueuesResponse> {
      const generatedAt = now().toISOString();
      if (!client) {
        return unavailable(
          generatedAt,
          'unconfigured',
          'Supabase pipeline queue is not connected',
        );
      }

      try {
        const current = now();
        const [ingestResult, visualResult, renderResult, activeSocialResult] =
          await Promise.all([
            client
              .from('podcast_ingest_jobs')
              .select(
                'id,source_url,language_code,status,attempt_count,lease_owner,lease_expires_at,last_error,created_at,updated_at',
              )
              .in('status', ACTIVE_STATUSES)
              .order('created_at', { ascending: true })
              .limit(READ_LIMIT),
            queryActiveWork(
              client,
              'episode_video_visuals',
              'episode_id,status,visual_version,progress_percent,progress_stage,attempt_count,next_attempt_at,lease_owner,lease_expires_at,last_error,started_at,completed_at,created_at,updated_at',
            ),
            queryActiveWork(
              client,
              'episode_videos',
              'episode_localization_id,episode_id,status,visual_version,progress_percent,progress_stage,attempt_count,next_attempt_at,lease_owner,lease_expires_at,last_error,started_at,completed_at,thumbnail_url,created_at,updated_at',
            ),
            client
              .from('social_publish_jobs')
              .select('episode_id')
              .in('status', ACTIVE_STATUSES)
              .order('scheduled_at', { ascending: true })
              .limit(READ_LIMIT),
          ]);
        throwFirstError(
          ingestResult,
          visualResult,
          renderResult,
          activeSocialResult,
        );

        const ingests = (ingestResult.data ?? []) as IngestRow[];
        const visuals = (visualResult.data ?? []) as VideoWorkRow[];
        const renders = (renderResult.data ?? []) as RenderRow[];
        const activeSocialEpisodeIds = unique(
          ((activeSocialResult.data ?? []) as { episode_id: string }[]).map(
            (row) => row.episode_id,
          ),
        );
        const socialJobs = await readSocialJobs(client, activeSocialEpisodeIds);

        const episodeIds = unique([
          ...visuals.map((row) => row.episode_id),
          ...renders.map((row) => row.episode_id),
          ...socialJobs.map((row) => row.episode_id),
        ]);
        const sourceUrls = unique(ingests.map((row) => row.source_url));
        const episodes = await readEpisodes(client, episodeIds, sourceUrls);
        const resolvedEpisodeIds = episodes.map((row) => row.id);

        const [localizations, visualStates, socialPosts, publishedToday] =
          await Promise.all([
            readRowsByEpisode<LocalizationRow>(
              client,
              'episode_localizations',
              'id,episode_id,language_code,script,hls_url,classroom_hls_url,status,updated_at',
              resolvedEpisodeIds,
            ),
            readRowsByEpisode<VisualStateRow>(
              client,
              'episode_video_visuals',
              'episode_id,status,visual_version,abandoned_at,abandoned_reason',
              resolvedEpisodeIds,
            ),
            readRowsByEpisode<SocialPostRow>(
              client,
              'social_posts',
              'id,episode_id,platform,language_code,post_url,published_at',
              resolvedEpisodeIds,
            ),
            readPublishedToday(client, current),
          ]);

        return buildPipelineQueues({
          generatedAt,
          now: current,
          episodes,
          localizations,
          visualStates,
          ingests,
          visuals,
          renders,
          socialJobs,
          socialPosts,
          publishedToday,
        });
      } catch (cause) {
        return unavailable(
          generatedAt,
          'error',
          cause instanceof Error ? cause.message : 'Pipeline queue read failed',
        );
      }
    },
  };
}

export function buildPipelineQueues(input: {
  generatedAt: string;
  now: Date;
  episodes: EpisodeRow[];
  localizations: LocalizationRow[];
  visualStates: VisualStateRow[];
  ingests: IngestRow[];
  visuals: VideoWorkRow[];
  renders: RenderRow[];
  socialJobs: SocialJobRow[];
  socialPosts: SocialPostRow[];
  publishedToday: number;
}): PipelineQueuesResponse {
  const episodeById = new Map(input.episodes.map((row) => [row.id, row]));
  const episodeBySource = new Map(
    input.episodes.map((row) => [row.source_url, row]),
  );
  const localizationById = new Map(
    input.localizations.map((row) => [row.id, row]),
  );
  const localizationsByEpisode = groupBy(
    input.localizations,
    (row) => row.episode_id,
  );
  const postsByEpisode = groupBy(input.socialPosts, (row) => row.episode_id);
  const visualStateByEpisode = new Map(
    input.visualStates.map((row) => [row.episode_id, row]),
  );
  const videoPrereqsByEpisode = new Map(
    input.episodes.map((episode) => [
      episode.id,
      videoPrerequisitesReady(localizationsByEpisode.get(episode.id) ?? []),
    ]),
  );

  const apiItems = input.ingests.map((row) => {
    const episode = episodeBySource.get(row.source_url);
    const episodeId = episode?.id;
    return workItem({
      key: `ingest:${row.id}`,
      kind: 'ingest',
      title: episode?.source_title ?? row.source_url,
      ...(episodeId ? { episodeId } : {}),
      sourceUrl: row.source_url,
      languageCode: row.language_code,
      status: row.status,
      attemptCount: row.attempt_count,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: row.lease_expires_at,
      lastError: row.last_error,
      queuedAt: row.created_at,
      updatedAt: row.updated_at,
      currentStep: episodeId
        ? ingestStep(localizationsByEpisode.get(episodeId) ?? [])
        : 'Ingest',
      now: input.now,
      posts: episodeId ? (postsByEpisode.get(episodeId) ?? []) : [],
    });
  });

  const visualItems = input.visuals.flatMap((row) => {
    const episode = episodeById.get(row.episode_id);
    if (!episode) {
      return [];
    }
    return [
      videoWorkItem({
        row,
        episode,
        kind: 'visual',
        currentStep: row.progress_stage ?? 'Visual planning',
        now: input.now,
        posts: postsByEpisode.get(episode.id) ?? [],
        visualState: visualStateByEpisode.get(episode.id),
        videoPrereqsReady: videoPrereqsByEpisode.get(episode.id) ?? false,
      }),
    ];
  });

  const renderItems = input.renders.flatMap((row) => {
    const episode = episodeById.get(row.episode_id);
    if (!episode) {
      return [];
    }
    const localization = localizationById.get(row.episode_localization_id);
    return [
      videoWorkItem({
        row,
        episode,
        kind: 'render',
        key: `render:${row.episode_localization_id}`,
        languageCode: localization?.language_code,
        currentStep: row.progress_stage ?? 'Rendering',
        thumbnailUrl: row.thumbnail_url,
        now: input.now,
        posts: postsByEpisode.get(episode.id) ?? [],
        localizationId: row.episode_localization_id,
        visualState: visualStateByEpisode.get(episode.id),
        videoPrereqsReady: videoPrereqsByEpisode.get(episode.id) ?? false,
      }),
    ];
  });

  // Abandoned video work is not queue work: it stays visible under its own
  // heading so a UUID search still finds it, but it never competes for
  // attention with jobs somebody can actually unblock.
  const videoItems = [...visualItems, ...renderItems];
  const abandonedItems = videoItems
    .filter((item) => item.abandoned)
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  const api = lane(apiItems);
  const render = {
    ...lane(videoItems.filter((item) => !item.abandoned)),
    abandoned: abandonedItems,
  };
  const social = socialLane(
    socialQueueItems(
      input.socialJobs,
      input.socialPosts,
      episodeById,
      input.now,
    ),
  );

  return {
    generatedAt: input.generatedAt,
    status: 'ok',
    message: null,
    summary: {
      queueDepth:
        api.queued.length + render.queued.length + social.queued.length,
      processing:
        api.processing.length +
        render.processing.length +
        social.processing.length,
      blockedOrFailed:
        api.attention.length +
        render.attention.length +
        social.attention.length,
      publishedToday: input.publishedToday,
      abandoned: abandonedItems.length,
    },
    api,
    render,
    social,
  };
}

function videoWorkItem(input: {
  row: VideoWorkRow;
  episode: EpisodeRow;
  kind: 'visual' | 'render';
  key?: string;
  languageCode?: string;
  currentStep: string;
  thumbnailUrl?: string | null;
  now: Date;
  posts: SocialPostRow[];
  localizationId?: string;
  visualState?: VisualStateRow | undefined;
  videoPrereqsReady: boolean;
}): PipelineQueueItem {
  const { row, episode } = input;
  return workItem({
    key: input.key ?? `visual:${episode.id}`,
    kind: input.kind,
    title: episode.source_title ?? episode.id,
    episodeId: episode.id,
    ...(input.languageCode ? { languageCode: input.languageCode } : {}),
    status: row.status,
    visualVersion: row.visual_version,
    attemptCount: row.attempt_count,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    lastError: row.last_error,
    queuedAt: row.created_at,
    nextAttemptAt: row.next_attempt_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    currentStep: input.currentStep,
    progressPercent: row.progress_percent,
    thumbnailUrl: input.thumbnailUrl,
    now: input.now,
    posts: input.posts,
    ...(input.localizationId ? { localizationId: input.localizationId } : {}),
    visualState: input.visualState,
    videoPrereqsReady: input.videoPrereqsReady,
  });
}

function workItem(input: WorkItemInput): PipelineQueueItem {
  const activeLease =
    Boolean(input.leaseOwner) && leaseIsActive(input.leaseExpiresAt, input.now);
  const staleVersion = Boolean(
    !activeLease &&
    (input.status === 'queued' || input.status === 'processing') &&
    input.visualVersion &&
    input.visualVersion !== EPISODE_VIDEO_VISUAL_VERSION,
  );
  const state = deriveWorkState(
    input.status,
    input.attemptCount,
    activeLease,
    staleVersion,
  );
  const history = workHistory(input);
  const abandoned = abandonState(input.visualState);

  return {
    key: input.key,
    kind: input.kind,
    ...(input.episodeId ? { episodeId: input.episodeId } : {}),
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    title: input.title,
    ...(input.languageCode ? { languageCode: input.languageCode } : {}),
    state,
    queuedAt: input.queuedAt,
    ...(input.nextAttemptAt ? { nextAttemptAt: input.nextAttemptAt } : {}),
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    updatedAt: input.updatedAt,
    ...(activeLease && input.leaseOwner ? { workerId: input.leaseOwner } : {}),
    currentStep: staleVersion ? 'Stale visual version' : input.currentStep,
    ...(input.progressPercent !== null && input.progressPercent !== undefined
      ? { progressPercent: input.progressPercent }
      : {}),
    retryCount: Math.max(0, input.attemptCount - 1),
    ...(input.lastError ? { lastError: input.lastError } : {}),
    ...(input.thumbnailUrl ? { thumbnailUrl: input.thumbnailUrl } : {}),
    history,
    publishedLinks: publishedLinks(input.posts),
    actions: workActions({ input, state, activeLease, abandoned }),
    ...(abandoned ? { abandoned } : {}),
  };
}

function abandonState(
  row: VisualStateRow | undefined,
): { at: string; reason: string } | null {
  if (!row?.abandoned_at) {
    return null;
  }
  return {
    at: row.abandoned_at,
    reason: row.abandoned_reason?.trim() || 'No reason recorded',
  };
}

/**
 * Every restart the control center can offer goes through one of three RPCs,
 * each of which refuses the same conditions we check here. Offering a button the
 * RPC would reject only produces a 409, so a refusal is reported as text instead.
 */
function workActions(context: {
  input: WorkItemInput;
  state: PipelineQueueItem['state'];
  activeLease: boolean;
  abandoned: { at: string; reason: string } | null;
}): PipelineQueueItemActions {
  const { input, state, activeLease, abandoned } = context;

  if (!input.episodeId) {
    return {
      disabledReason:
        'This ingest never produced an episode row; re-submit the source URL to retry it.',
    };
  }
  if (abandoned) {
    return {
      disabledReason: `Closed by an operator: ${abandoned.reason}`,
    };
  }
  if (activeLease) {
    return { disabledReason: 'A worker holds this job right now.' };
  }
  if (state === 'queued') {
    return { disabledReason: 'Waiting for a worker; nothing to retry yet.' };
  }

  if (input.kind === 'ingest') {
    return { restart: { step: 'ingest' } };
  }

  // A render can only be requeued on its own when the shared visual checkpoint
  // is completed and current; otherwise the whole episode video has to be
  // restarted, which re-plans the visual first.
  if (
    input.kind === 'render' &&
    input.localizationId &&
    visualIsRenderable(
      input.visualState?.status,
      input.visualState?.visual_version,
    )
  ) {
    return {
      restart: { step: 'render', localizationId: input.localizationId },
    };
  }
  if (input.videoPrereqsReady === false) {
    return {
      disabledReason:
        'Video work needs completed zh-Hant, ja and en audio before it can restart.',
    };
  }
  return { restart: { step: 'video', forceReplan: false } };
}

/**
 * Mirrors the language check inside `retry_episode_video_generation`; without it
 * the button would 409 on episodes whose audio never finished.
 */
function videoPrerequisitesReady(localizations: LocalizationRow[]): boolean {
  const ready = new Set(
    localizations
      .filter((row) => {
        if (row.status !== 'completed') {
          return false;
        }
        if (!row.script?.trim() || !row.hls_url?.trim()) {
          return false;
        }
        return (
          row.language_code !== 'zh-Hant' ||
          Boolean(row.classroom_hls_url?.trim())
        );
      })
      .map((row) => row.language_code),
  );
  return ['zh-Hant', 'ja', 'en'].every((language) => ready.has(language));
}

function deriveWorkState(
  status: string,
  attemptCount: number,
  activeLease: boolean,
  staleVersion: boolean,
): PipelineQueueItem['state'] {
  if (staleVersion) {
    return 'blocked';
  }
  if (status === 'processing' && activeLease) {
    return 'processing';
  }
  if (status === 'failed') {
    return 'failed';
  }
  if (status === 'processing' || attemptCount > 0) {
    return 'retrying';
  }
  return 'queued';
}

function workHistory(input: WorkItemInput): PipelineQueueHistoryEvent[] {
  const history: PipelineQueueHistoryEvent[] = [
    { at: input.queuedAt, label: 'Added to queue' },
  ];
  if (input.startedAt) {
    history.push({ at: input.startedAt, label: 'Worker started' });
  }
  if (input.completedAt) {
    history.push({ at: input.completedAt, label: 'Completed' });
  }
  if (input.status === 'failed' && input.lastError) {
    history.push({
      at: input.updatedAt,
      label: 'Failed',
      detail: input.lastError,
    });
  }
  return history.sort(byEventTime);
}

function socialQueueItems(
  jobs: SocialJobRow[],
  posts: SocialPostRow[],
  episodeById: Map<string, EpisodeRow>,
  now: Date,
): SocialQueueItem[] {
  const jobsByEpisode = groupBy(jobs, (row) => row.episode_id);
  const postsByEpisode = groupBy(posts, (row) => row.episode_id);
  const items: SocialQueueItem[] = [];

  for (const [episodeId, episodeJobs] of jobsByEpisode) {
    const episode = episodeById.get(episodeId);
    if (!episode) {
      continue;
    }
    const episodePosts = postsByEpisode.get(episodeId) ?? [];
    const postByLane = new Map(
      episodePosts.map((post) => [
        laneKey(post.platform, post.language_code),
        post,
      ]),
    );
    const platforms = socialPlatforms(episodeJobs, postByLane, now);
    if (platforms.length === 0) {
      continue;
    }

    items.push({
      key: `social:${episodeId}`,
      episodeId,
      title: episode.source_title ?? episodeId,
      contentType: 'video',
      scheduledAt: earliestScheduledAt(episodeJobs),
      state: deriveSocialState(platforms),
      platforms,
      history: socialHistory(episodeJobs, episodePosts),
      publishedLinks: publishedLinks(episodePosts),
    });
  }

  return items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

function socialPlatforms(
  jobs: SocialJobRow[],
  postByLane: Map<string, SocialPostRow>,
  now: Date,
): SocialPlatformQueueState[] {
  return jobs
    .flatMap((job): SocialPlatformQueueState[] => {
      if (!isPlatform(job.platform)) {
        return [];
      }
      const post = postByLane.get(laneKey(job.platform, job.language_code));
      const activeLease =
        Boolean(job.lease_owner) && leaseIsActive(job.lease_expires_at, now);
      return [
        {
          platform: job.platform,
          languageCode: job.language_code,
          status: socialPlatformStatus(job, post, now),
          scheduledAt: job.scheduled_at,
          nextAttemptAt: job.next_attempt_at,
          ...(post ? { publishedAt: post.published_at } : {}),
          ...(post?.post_url ? { url: post.post_url } : {}),
          ...(activeLease && job.lease_owner
            ? { workerId: job.lease_owner }
            : {}),
          ...(job.last_error ? { error: job.last_error } : {}),
          retryCount: Math.max(0, job.attempt_count - 1),
        },
      ];
    })
    .sort((a, b) => platformOrder(a.platform) - platformOrder(b.platform));
}

function socialHistory(
  jobs: SocialJobRow[],
  posts: SocialPostRow[],
): PipelineQueueHistoryEvent[] {
  const history: PipelineQueueHistoryEvent[] = jobs.map((job) => ({
    at: job.created_at,
    label: `${job.platform} added to social queue`,
  }));
  for (const post of posts) {
    history.push({
      at: post.published_at,
      label: `${post.platform} published`,
      ...(post.post_url ? { detail: post.post_url } : {}),
    });
  }
  for (const job of jobs) {
    if (job.status === 'failed' && job.last_error) {
      history.push({
        at: job.updated_at,
        label: `${job.platform} failed`,
        detail: job.last_error,
      });
    }
  }
  return history.sort(byEventTime);
}

function socialPlatformStatus(
  job: SocialJobRow,
  post: SocialPostRow | undefined,
  now: Date,
): SocialPublishStatus {
  if (post) {
    return 'published';
  }
  if (job.status === 'skipped') {
    return 'skipped';
  }
  if (job.status === 'processing') {
    return Boolean(job.lease_owner) && leaseIsActive(job.lease_expires_at, now)
      ? 'publishing'
      : 'queued';
  }
  if (job.status === 'failed') {
    return 'failed';
  }
  if (job.status === 'queued') {
    return new Date(job.scheduled_at).getTime() > now.getTime()
      ? 'scheduled'
      : 'queued';
  }
  // A completed durable-queue row without social_posts evidence is not proof
  // that a public post exists.
  return 'failed';
}

export function deriveSocialState(
  platforms: SocialPlatformQueueState[],
): SocialQueueState {
  const statuses = platforms.map((row) => row.status);
  if (statuses.some((status) => status === 'publishing')) {
    return 'publishing';
  }
  const published = statuses.filter((status) => status === 'published').length;
  const failed = statuses.filter((status) => status === 'failed').length;
  const unfinished = statuses.filter(
    (status) => status === 'queued' || status === 'scheduled',
  ).length;
  if (published === statuses.length) {
    return 'published';
  }
  if (published > 0 && (failed > 0 || unfinished > 0)) {
    return 'partial';
  }
  if (failed > 0 && failed === statuses.length) {
    return 'failed';
  }
  if (failed > 0) {
    return 'partial';
  }
  return 'queued';
}

function lane(
  items: PipelineQueueItem[],
): PipelineQueueLane<PipelineQueueItem> {
  return {
    processing: items
      .filter((item) => item.state === 'processing')
      .sort(
        (a, b) =>
          time(a.startedAt ?? a.updatedAt) - time(b.startedAt ?? b.updatedAt),
      ),
    queued: items
      .filter((item) => item.state === 'queued' || item.state === 'retrying')
      .sort(compareWaitingItems),
    attention: items
      .filter((item) => item.state === 'failed' || item.state === 'blocked')
      .sort((a, b) => time(a.updatedAt) - time(b.updatedAt)),
  };
}

function compareWaitingItems(
  a: PipelineQueueItem,
  b: PipelineQueueItem,
): number {
  const availableOrder =
    time(a.nextAttemptAt ?? a.queuedAt) - time(b.nextAttemptAt ?? b.queuedAt);
  return availableOrder || time(a.queuedAt) - time(b.queuedAt);
}

function socialLane(
  items: SocialQueueItem[],
): PipelineQueueLane<SocialQueueItem> {
  return {
    processing: items.filter((item) => item.state === 'publishing'),
    queued: items.filter(
      (item) => item.state === 'queued' || item.state === 'partial',
    ),
    attention: items.filter((item) => item.state === 'failed'),
  };
}

function ingestStep(localizations: LocalizationRow[]): string {
  if (localizations.length === 0) {
    return 'Ingest';
  }
  if (localizations.some((row) => !row.script)) {
    return 'Translate';
  }
  if (localizations.some((row) => !row.hls_url)) {
    return 'TTS';
  }
  return 'Finalization';
}

function publishedLinks(posts: SocialPostRow[]): PipelinePublishedLink[] {
  return posts
    .flatMap((post): PipelinePublishedLink[] => {
      if (!isPlatform(post.platform)) {
        return [];
      }
      return [
        {
          platform: post.platform,
          languageCode: post.language_code,
          publishedAt: post.published_at,
          url: post.post_url,
        },
      ];
    })
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
}

async function readSocialJobs(
  client: NonNullable<ReturnType<typeof createConfiguredServiceRoleClient>>,
  episodeIds: string[],
): Promise<SocialJobRow[]> {
  if (episodeIds.length === 0) {
    return [];
  }
  const result = (await client
    .from('social_publish_jobs')
    .select(
      'id,episode_id,platform,language_code,status,scheduled_at,next_attempt_at,attempt_count,lease_owner,lease_expires_at,last_error,completed_at,created_at,updated_at',
    )
    .in('episode_id', episodeIds)
    .order('scheduled_at', { ascending: true })) as MaybeError<SocialJobRow[]>;
  throwFirstError(result);
  return result.data ?? [];
}

async function readEpisodes(
  client: NonNullable<ReturnType<typeof createConfiguredServiceRoleClient>>,
  episodeIds: string[],
  sourceUrls: string[],
): Promise<EpisodeRow[]> {
  const empty = { data: [], error: null };
  const [byId, bySource] = await Promise.all([
    episodeIds.length === 0
      ? Promise.resolve(empty)
      : client
          .from('episodes')
          .select('id,source_title,source_url,created_at')
          .in('id', episodeIds),
    sourceUrls.length === 0
      ? Promise.resolve(empty)
      : client
          .from('episodes')
          .select('id,source_title,source_url,created_at')
          .in('source_url', sourceUrls),
  ]);
  throwFirstError(byId, bySource);
  return dedupeEpisodes([
    ...((byId.data ?? []) as EpisodeRow[]),
    ...((bySource.data ?? []) as EpisodeRow[]),
  ]);
}

async function readRowsByEpisode<T>(
  client: NonNullable<ReturnType<typeof createConfiguredServiceRoleClient>>,
  table: 'episode_localizations' | 'social_posts' | 'episode_video_visuals',
  columns: string,
  episodeIds: string[],
): Promise<T[]> {
  if (episodeIds.length === 0) {
    return [];
  }
  const result = (await client
    .from(table)
    .select(columns)
    .in('episode_id', episodeIds)) as MaybeError<T[]>;
  throwFirstError(result);
  return result.data ?? [];
}

async function readPublishedToday(
  client: NonNullable<ReturnType<typeof createConfiguredServiceRoleClient>>,
  now: Date,
): Promise<number> {
  const result = await client
    .from('social_posts')
    .select('id', { count: 'exact', head: true })
    .gte('published_at', startOfJstDay(now));
  throwFirstError(result);
  return result.count ?? 0;
}

function queryActiveWork(
  client: NonNullable<ReturnType<typeof createConfiguredServiceRoleClient>>,
  table: string,
  columns: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any)
    .from(table)
    .select(columns)
    .in('status', ACTIVE_STATUSES)
    .order('next_attempt_at', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(READ_LIMIT);
}

function unavailable(
  generatedAt: string,
  status: 'unconfigured' | 'error',
  message: string,
): PipelineQueuesResponse {
  return {
    generatedAt,
    status,
    message,
    summary: {
      queueDepth: 0,
      processing: 0,
      blockedOrFailed: 0,
      publishedToday: 0,
      abandoned: 0,
    },
    api: emptyLane(),
    render: emptyLane(),
    social: emptyLane(),
  };
}

function emptyLane<T>(): PipelineQueueLane<T> {
  return { processing: [], queued: [], attention: [] };
}

function startOfJstDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return new Date(
    `${part('year')}-${part('month')}-${part('day')}T00:00:00+09:00`,
  ).toISOString();
}

function isPlatform(value: string): value is SocialPlatform {
  return (
    value === 'x' ||
    value === 'threads' ||
    value === 'rednote' ||
    value === 'youtube'
  );
}

function platformOrder(platform: SocialPlatform): number {
  return ['x', 'threads', 'rednote', 'youtube'].indexOf(platform);
}

function laneKey(platform: string, languageCode: string): string {
  return `${platform}:${languageCode}`;
}

function earliestScheduledAt(rows: SocialJobRow[]): string {
  return rows.map((row) => row.scheduled_at).sort()[0]!;
}

function time(value: string | undefined): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function byEventTime(
  a: PipelineQueueHistoryEvent,
  b: PipelineQueueHistoryEvent,
): number {
  return time(a.at) - time(b.at);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeEpisodes(rows: EpisodeRow[]): EpisodeRow[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = key(row);
    const group = groups.get(groupKey) ?? [];
    group.push(row);
    groups.set(groupKey, group);
  }
  return groups;
}

function throwFirstError(...results: Array<{ error: unknown }>): void {
  const failure = results.find((result) => result.error);
  if (failure?.error) {
    throw failure.error;
  }
}
