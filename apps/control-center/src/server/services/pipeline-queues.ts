import type {
  PipelinePublishedLink,
  PipelineQueueHistoryEvent,
  PipelineQueueItem,
  PipelineQueueLane,
  PipelineQueuesResponse,
  SocialPlatform,
  SocialPlatformQueueState,
  SocialPublishStatus,
  SocialQueueItem,
  SocialQueueState,
} from '../../shared/pipeline-queues.js';
import type { ControlCenterConfig } from '../config/env.js';
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
  updated_at: string;
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

interface VisualRow {
  episode_id: string;
  status: string;
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

interface RenderRow extends VisualRow {
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
            client
              .from('episode_video_visuals')
              .select(
                'episode_id,status,progress_percent,progress_stage,attempt_count,next_attempt_at,lease_owner,lease_expires_at,last_error,started_at,completed_at,created_at,updated_at',
              )
              .in('status', ACTIVE_STATUSES)
              .order('created_at', { ascending: true })
              .limit(READ_LIMIT),
            client
              .from('episode_videos')
              .select(
                'episode_localization_id,episode_id,status,progress_percent,progress_stage,attempt_count,next_attempt_at,lease_owner,lease_expires_at,last_error,started_at,completed_at,thumbnail_url,created_at,updated_at',
              )
              .in('status', ACTIVE_STATUSES)
              .order('created_at', { ascending: true })
              .limit(READ_LIMIT),
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

        const ingestRows = (ingestResult.data ?? []) as IngestRow[];
        const visualRows = (visualResult.data ?? []) as VisualRow[];
        const renderRows = (renderResult.data ?? []) as RenderRow[];
        const activeSocialEpisodeIds = unique(
          ((activeSocialResult.data ?? []) as { episode_id: string }[]).map(
            (row) => row.episode_id,
          ),
        );

        const socialJobsResult: MaybeError<SocialJobRow[]> =
          activeSocialEpisodeIds.length === 0
            ? { data: [], error: null }
            : ((await client
                .from('social_publish_jobs')
                .select(
                  'id,episode_id,platform,language_code,status,scheduled_at,next_attempt_at,attempt_count,lease_owner,lease_expires_at,last_error,completed_at,created_at,updated_at',
                )
                .in('episode_id', activeSocialEpisodeIds)
                .order('scheduled_at', { ascending: true })) as MaybeError<
                SocialJobRow[]
              >);
        throwFirstError(socialJobsResult);
        const socialJobRows = socialJobsResult.data ?? [];

        const directEpisodeIds = unique([
          ...visualRows.map((row) => row.episode_id),
          ...renderRows.map((row) => row.episode_id),
          ...socialJobRows.map((row) => row.episode_id),
        ]);
        const sourceUrls = unique(ingestRows.map((row) => row.source_url));

        const [episodesByIdResult, episodesBySourceResult] = await Promise.all([
          directEpisodeIds.length === 0
            ? Promise.resolve({ data: [], error: null })
            : client
                .from('episodes')
                .select('id,source_title,source_url,created_at')
                .in('id', directEpisodeIds),
          sourceUrls.length === 0
            ? Promise.resolve({ data: [], error: null })
            : client
                .from('episodes')
                .select('id,source_title,source_url,created_at')
                .in('source_url', sourceUrls),
        ]);
        throwFirstError(episodesByIdResult, episodesBySourceResult);

        const episodes = dedupeEpisodes([
          ...((episodesByIdResult.data ?? []) as EpisodeRow[]),
          ...((episodesBySourceResult.data ?? []) as EpisodeRow[]),
        ]);
        const episodeIds = episodes.map((row) => row.id);

        const [localizationsResult, postsResult, publishedTodayResult] =
          await Promise.all([
            episodeIds.length === 0
              ? Promise.resolve({ data: [], error: null })
              : client
                  .from('episode_localizations')
                  .select(
                    'id,episode_id,language_code,script,hls_url,updated_at',
                  )
                  .in('episode_id', episodeIds),
            episodeIds.length === 0
              ? Promise.resolve({ data: [], error: null })
              : client
                  .from('social_posts')
                  .select(
                    'id,episode_id,platform,language_code,post_url,published_at',
                  )
                  .in('episode_id', episodeIds),
            client
              .from('social_posts')
              .select('id', { count: 'exact', head: true })
              .gte('published_at', startOfJstDay(current)),
          ]);
        throwFirstError(
          localizationsResult,
          postsResult,
          publishedTodayResult,
        );

        return buildPipelineQueues({
          generatedAt,
          now: current,
          episodes,
          localizations: (localizationsResult.data ?? []) as LocalizationRow[],
          ingests: ingestRows,
          visuals: visualRows,
          renders: renderRows,
          socialJobs: socialJobRows,
          socialPosts: (postsResult.data ?? []) as SocialPostRow[],
          publishedToday: publishedTodayResult.count ?? 0,
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
  ingests: IngestRow[];
  visuals: VisualRow[];
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

  const apiItems = input.ingests.flatMap((row) => {
    const episode = episodeBySource.get(row.source_url);
    if (!episode) return [];
    return [
      pipelineItem({
        key: `ingest:${row.id}`,
        kind: 'ingest',
        episode,
        languageCode: row.language_code,
        status: row.status,
        attemptCount: row.attempt_count,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: row.lease_expires_at,
        lastError: row.last_error,
        queuedAt: row.created_at,
        updatedAt: row.updated_at,
        currentStep: ingestStep(
          localizationsByEpisode.get(episode.id) ?? [],
        ),
        now: input.now,
        posts: postsByEpisode.get(episode.id) ?? [],
      }),
    ];
  });

  const visualItems = input.visuals.flatMap((row) => {
    const episode = episodeById.get(row.episode_id);
    if (!episode) return [];
    return [
      pipelineItem({
        key: `visual:${row.episode_id}`,
        kind: 'visual',
        episode,
        status: row.status,
        attemptCount: row.attempt_count,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: row.lease_expires_at,
        lastError: row.last_error,
        queuedAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        updatedAt: row.updated_at,
        currentStep: row.progress_stage ?? 'Visual planning',
        progressPercent: row.progress_percent,
        now: input.now,
        posts: postsByEpisode.get(episode.id) ?? [],
      }),
    ];
  });

  const renderItems = input.renders.flatMap((row) => {
    const episode = episodeById.get(row.episode_id);
    const localization = localizationById.get(row.episode_localization_id);
    if (!episode) return [];
    return [
      pipelineItem({
        key: `render:${row.episode_localization_id}`,
        kind: 'render',
        episode,
        languageCode: localization?.language_code,
        status: row.status,
        attemptCount: row.attempt_count,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: row.lease_expires_at,
        lastError: row.last_error,
        queuedAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        updatedAt: row.updated_at,
        currentStep: row.progress_stage ?? 'Rendering',
        progressPercent: row.progress_percent,
        thumbnailUrl: row.thumbnail_url,
        now: input.now,
        posts: postsByEpisode.get(episode.id) ?? [],
      }),
    ];
  });

  const socialItems = socialQueueItems(
    input.socialJobs,
    input.socialPosts,
    episodeById,
    input.now,
  );

  const api = lane(apiItems);
  const render = lane([...visualItems, ...renderItems]);
  const social = socialLane(socialItems);
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
    },
    api,
    render,
    social,
  };
}

function pipelineItem(input: {
  key: string;
  kind: PipelineQueueItem['kind'];
  episode: EpisodeRow;
  languageCode?: string;
  status: string;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastError: string | null;
  queuedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
  currentStep: string;
  progressPercent?: number | null;
  thumbnailUrl?: string | null;
  now: Date;
  posts: SocialPostRow[];
}): PipelineQueueItem {
  const activeLease = leaseIsActive(
    input.leaseOwner,
    input.leaseExpiresAt,
    input.now,
  );
  const state =
    input.status === 'processing' && activeLease
      ? 'processing'
      : input.status === 'failed'
        ? 'failed'
        : input.status === 'processing' || input.attemptCount > 0
          ? 'retrying'
          : 'queued';
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
  return {
    key: input.key,
    kind: input.kind,
    episodeId: input.episode.id,
    title: input.episode.source_title ?? input.episode.id,
    ...(input.languageCode ? { languageCode: input.languageCode } : {}),
    state,
    queuedAt: input.queuedAt,
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    updatedAt: input.updatedAt,
    ...(activeLease && input.leaseOwner
      ? { workerId: input.leaseOwner }
      : {}),
    currentStep: input.currentStep,
    ...(input.progressPercent !== null && input.progressPercent !== undefined
      ? { progressPercent: input.progressPercent }
      : {}),
    retryCount: Math.max(0, input.attemptCount - 1),
    ...(input.lastError ? { lastError: input.lastError } : {}),
    ...(input.thumbnailUrl ? { thumbnailUrl: input.thumbnailUrl } : {}),
    history: history.sort(byEventTime),
    publishedLinks: publishedLinks(input.posts),
  };
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
    if (!episode) continue;
    const episodePosts = postsByEpisode.get(episodeId) ?? [];
    const postByLane = new Map(
      episodePosts.map((post) => [
        laneKey(post.platform, post.language_code),
        post,
      ]),
    );
    const platforms = episodeJobs
      .map((job): SocialPlatformQueueState | null => {
        if (!isPlatform(job.platform)) return null;
        const post = postByLane.get(
          laneKey(job.platform, job.language_code),
        );
        const status = socialPlatformStatus(job, post, now);
        const activeLease = leaseIsActive(
          job.lease_owner,
          job.lease_expires_at,
          now,
        );
        return {
          platform: job.platform,
          languageCode: job.language_code,
          status,
          scheduledAt: job.scheduled_at,
          nextAttemptAt: job.next_attempt_at,
          ...(post ? { publishedAt: post.published_at } : {}),
          ...(post?.post_url ? { url: post.post_url } : {}),
          ...(activeLease && job.lease_owner
            ? { workerId: job.lease_owner }
            : {}),
          ...(job.last_error ? { error: job.last_error } : {}),
          retryCount: Math.max(0, job.attempt_count - 1),
        };
      })
      .filter((row): row is SocialPlatformQueueState => row !== null)
      .sort((a, b) => platformOrder(a.platform) - platformOrder(b.platform));
    if (platforms.length === 0) continue;

    const history: PipelineQueueHistoryEvent[] = episodeJobs.map((job) => ({
      at: job.created_at,
      label: `${job.platform} added to social queue`,
    }));
    for (const post of episodePosts) {
      history.push({
        at: post.published_at,
        label: `${post.platform} published`,
        ...(post.post_url ? { detail: post.post_url } : {}),
      });
    }
    for (const job of episodeJobs) {
      if (job.status === 'failed' && job.last_error) {
        history.push({
          at: job.updated_at,
          label: `${job.platform} failed`,
          detail: job.last_error,
        });
      }
    }

    items.push({
      key: `social:${episodeId}`,
      episodeId,
      title: episode.source_title ?? episodeId,
      contentType: 'video',
      scheduledAt: episodeJobs.map((job) => job.scheduled_at).sort()[0]!,
      state: deriveSocialState(platforms),
      platforms,
      history: history.sort(byEventTime),
      publishedLinks: publishedLinks(episodePosts),
    });
  }
  return items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

function socialPlatformStatus(
  job: SocialJobRow,
  post: SocialPostRow | undefined,
  now: Date,
): SocialPublishStatus {
  if (post) return 'published';
  if (job.status === 'skipped') return 'skipped';
  if (job.status === 'processing') {
    return leaseIsActive(job.lease_owner, job.lease_expires_at, now)
      ? 'publishing'
      : 'queued';
  }
  if (job.status === 'failed') return 'failed';
  if (job.status === 'queued') {
    return new Date(job.scheduled_at).getTime() > now.getTime()
      ? 'scheduled'
      : 'queued';
  }
  // A completed row without social_posts evidence is not proof of publication.
  return 'failed';
}

export function deriveSocialState(
  platforms: SocialPlatformQueueState[],
): SocialQueueState {
  const statuses = platforms.map((row) => row.status);
  if (statuses.some((status) => status === 'publishing')) return 'publishing';
  const published = statuses.filter((status) => status === 'published').length;
  const failed = statuses.filter((status) => status === 'failed').length;
  const unfinished = statuses.filter(
    (status) => status === 'queued' || status === 'scheduled',
  ).length;
  if (published === statuses.length) return 'published';
  if (published > 0 && (failed > 0 || unfinished > 0)) return 'partial';
  if (failed > 0 && failed === statuses.length) return 'failed';
  if (failed > 0) return 'partial';
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
          time(a.startedAt ?? a.updatedAt) -
          time(b.startedAt ?? b.updatedAt),
      ),
    queued: items
      .filter((item) => item.state === 'queued' || item.state === 'retrying')
      .sort((a, b) => time(a.queuedAt) - time(b.queuedAt)),
    attention: items
      .filter((item) => item.state === 'failed' || item.state === 'blocked')
      .sort((a, b) => time(a.updatedAt) - time(b.updatedAt)),
  };
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
  if (
    localizations.length === 0 ||
    localizations.some((row) => !row.script)
  ) {
    return 'Translate';
  }
  if (localizations.some((row) => !row.hls_url)) return 'TTS';
  return 'Finalization';
}

function publishedLinks(posts: SocialPostRow[]): PipelinePublishedLink[] {
  return posts
    .flatMap((post): PipelinePublishedLink[] =>
      isPlatform(post.platform)
        ? [
            {
              platform: post.platform,
              languageCode: post.language_code,
              publishedAt: post.published_at,
              url: post.post_url,
            },
          ]
        : [],
    )
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
}

function unavailable(
  generatedAt: string,
  status: 'unconfigured' | 'error',
  message: string,
): PipelineQueuesResponse {
  const empty = { processing: [], queued: [], attention: [] };
  return {
    generatedAt,
    status,
    message,
    summary: {
      queueDepth: 0,
      processing: 0,
      blockedOrFailed: 0,
      publishedToday: 0,
    },
    api: empty,
    render: empty,
    social: empty,
  };
}

function leaseIsActive(
  owner: string | null,
  expiresAt: string | null,
  now: Date,
): boolean {
  return Boolean(
    owner && expiresAt && new Date(expiresAt).getTime() > now.getTime(),
  );
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
  if (failure?.error) throw failure.error;
}
