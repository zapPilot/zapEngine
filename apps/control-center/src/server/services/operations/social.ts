import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  OperationalSignal,
  OperationalStatus,
  OperationsSocialDaemon,
  OperationsSocialJob,
  OperationsSocialResponse,
  OperationsSocialWaitingMedia,
} from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import {
  isCurrentVisualVersion,
  visualIsRenderable,
} from '../podcast-retry-eligibility.js';
import {
  buildSignal,
  errorMessage,
  sourceFailure,
  unknownSignal,
} from './signal.js';

const DAEMON_STATE_ID = 'local-social-daemon-v1';
const JOB_LIMIT = 200;
const PENDING_STATUSES = ['queued', 'processing', 'failed'];

/**
 * The daemon ticks on a short loop, so a gap this long is already a machine
 * that stopped rather than a slow pass.
 */
const DAEMON_STALE_MINUTES = 10;

/**
 * A job is claimed by a poll, not by a timer, so the few minutes between
 * `next_attempt_at` and the tick that picks it up are normal. Without this
 * window every healthy queue would report itself late once per cycle.
 */
const JOB_GRACE_MINUTES = 15;

/**
 * Mirrors the `attempt_count < 8` fence inside
 * `from_fed_to_chain.claim_social_publish_batch`: at eight attempts the claim
 * query stops returning the lane entirely, so it is not late, it is finished.
 * The constant lives in that function; this copy exists because the Control
 * Center reads the table rather than calling the claim.
 */
const MAX_ATTEMPTS = 8;

/**
 * Mirrors the `attempt_count < 3` fence in `claim_episode_video_v2` and the
 * `attempt_count >= 3 then 'failed'` transition in `fail_episode_video`. Both
 * live in `supabase/migrations`; this copy exists because Control Center reads
 * the view rather than calling the claim.
 */
const MAX_RENDER_ATTEMPTS = 3;

/**
 * `social_waiting_media` is policy-shaped — one row per (episode, language)
 * lane — so a single unrendered localization can contribute several rows. The
 * floor is set against that inflated count on purpose: one or two rows is a
 * video still rendering, a handful means rendering has stopped.
 *
 * The floor stays, but it is no longer the only rule. It answers "is a lot
 * stuck?" and is blind to "has one thing been stuck forever?" — production held
 * a single lane for roughly 240 hours while this signal reported healthy.
 */
const WAITING_MEDIA_FLOOR = 3;

/**
 * Bounded like `JOB_LIMIT`, and ordered oldest-first so the limit can never hide
 * the oldest lane. A truncated sample makes `blockedWaitingLanes` a lower bound,
 * which is safe here: any total past the sample is far past `WAITING_MEDIA_FLOOR`
 * and already degrades on count alone.
 */
const WAITING_MEDIA_SAMPLE_LIMIT = 200;

/**
 * Measured against 212 completed production lanes on 2026-09-14: p50 4.07h,
 * p90 41.13h, p99 191.40h. 48h sits just above p90, so an ordinary slow render
 * does not trip it while the tail that needed an operator does. Age alone is
 * only `degraded`; the decisive reading is whether a worker can still claim the
 * lane at all. Revisit after another month of observations.
 */
const WAITING_MEDIA_STALE_HOURS = 48;

const WAITING_MEDIA_COLUMNS = [
  'episode_id',
  'language_code',
  'waiting_since',
  'last_progress_at',
  'render_status',
  'render_attempt_count',
  'render_next_attempt_at',
  'render_lease_expires_at',
  'render_visual_version',
  'render_visual_hash',
  'visual_status',
  'visual_version',
  'visual_hash',
].join(',');

/**
 * `OperationsSocialResponse` carries no status field — the panel renders
 * `message` verbatim — so this exact string doubles as the marker that tells
 * "never wired up" apart from "Supabase answered with an error". Any other
 * non-null message came back from the database and means a lost reading.
 */
const UNCONFIGURED_MESSAGE = 'Supabase social queue is not connected';

const DAEMON_TITLE: Record<OperationalStatus, string> = {
  healthy: 'Social daemon is ticking',
  degraded: 'Social daemon heartbeat is stale',
  critical: 'Social daemon stalled while posts are overdue',
  unknown: 'Social daemon has never reported a heartbeat',
};

const DAEMON_DETAIL: Record<OperationalStatus, string> = {
  healthy: `Last tick started under ${DAEMON_STALE_MINUTES} minutes ago.`,
  degraded:
    'The daemon has not started a tick recently. It runs on a laptop rather ' +
    'than on a scheduler, so a closed lid, a sleeping machine, or a closed ' +
    'terminal is the usual cause — queued posts simply sit still until ' +
    'someone wakes it.',
  critical:
    'The daemon is not ticking and queued posts are already past their ' +
    'publish window, so slots are being missed right now. It runs on a ' +
    'laptop: a closed lid or a closed terminal is the usual cause, and ' +
    'nothing publishes until that machine is awake again.',
  unknown:
    'No heartbeat has been recorded for this daemon. Either it has not run ' +
    'since heartbeat reporting landed, or the machine is running an older ' +
    'build that does not write one.',
};

/**
 * Timestamps are read back as strings and then subtracted, so a value the
 * platform cannot parse would silently produce `NaN` minutes and a job that
 * can never look overdue. Reject it here and drop the row instead.
 */
const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));

const waitingRowSchema = z.object({
  episode_id: z.string(),
  language_code: z.string().nullish(),
  waiting_since: timestamp,
  last_progress_at: timestamp.nullable(),
  render_status: z.string().nullable(),
  // PostgREST serialises integer columns as JSON numbers here, but the same
  // bigint-as-string hazard documented on `jobRowSchema` applies the moment a
  // column type widens, and a dropped row would understate how much is stuck.
  render_attempt_count: z.coerce.number().nullable(),
  render_next_attempt_at: timestamp.nullable(),
  render_lease_expires_at: timestamp.nullable(),
  render_visual_version: z.string().nullable(),
  render_visual_hash: z.string().nullable(),
  visual_status: z.string().nullable(),
  visual_version: z.string().nullable(),
  visual_hash: z.string().nullable(),
});

const jobRowSchema = z.object({
  episode_id: z.string(),
  platform: z.string(),
  // Absent reads the same as null here because the code is a label on the
  // lane, not part of what makes it a lane: dropping the row over a missing
  // one would hide a job that is otherwise perfectly legible.
  language_code: z.string().nullish(),
  status: z.string(),
  scheduled_at: timestamp,
  next_attempt_at: timestamp,
  /**
   * PostgREST serialises a bigint column as a decimal string ("3"). A plain
   * `z.number()` drops every row, and a queue where every row was dropped is
   * indistinguishable from an empty one — the mistake that turns a stalled
   * publisher into a green panel. `'abc'` still fails: it coerces to `NaN`,
   * which `z.number()` rejects.
   */
  attempt_count: z.coerce.number(),
});

/**
 * Every field is optional as well as nullable because the heartbeat columns
 * arrive in a later migration than this reader: against a database where it
 * has not been applied the row comes back with those keys simply absent, and
 * that has to read as "no heartbeat yet", not as a parse failure.
 */
const daemonRowSchema = z.object({
  first_started_at: timestamp.nullish(),
  last_tick_started_at: timestamp.nullish(),
  last_tick_completed_at: timestamp.nullish(),
  last_success_at: timestamp.nullish(),
  last_error: z.string().nullish(),
  owner: z.string().nullish(),
  daemon_version: z.string().nullish(),
});

export async function loadOperationsSocial(input: {
  config: ControlCenterConfig;
  now: Date;
  createClient?: typeof createClient;
}): Promise<OperationsSocialResponse> {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = input.config;
  if (!url || !key) {
    return emptyResponse(input.now, UNCONFIGURED_MESSAGE);
  }

  try {
    const client = (input.createClient ?? createClient)(url, key, {
      db: { schema: input.config.SUPABASE_DB_SCHEMA },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const [jobResult, daemonResult, waitingResult] = await Promise.all([
      client
        .from('social_publish_jobs')
        .select(
          'episode_id,platform,language_code,status,scheduled_at,next_attempt_at,attempt_count',
        )
        .in('status', PENDING_STATUSES)
        .limit(JOB_LIMIT),
      // `select('*')` rather than a column list: naming the heartbeat columns
      // would make this request fail outright against a database that has not
      // taken the migration yet, losing the queue reading with it.
      client
        .from('social_daemon_state')
        .select('*')
        .eq('id', DAEMON_STATE_ID)
        .maybeSingle(),
      // Naming the appended columns — and ordering by one of them — is what
      // lets this read report an age at all, but it also makes the request fail
      // outright against a database that has not taken the migration yet. That
      // failure is deliberately NOT fatal here: it costs the age dimension, and
      // it must not cost the queue and daemon readings alongside it.
      client
        .from('social_waiting_media')
        .select(WAITING_MEDIA_COLUMNS, { count: 'exact' })
        .order('waiting_since', { ascending: true })
        .limit(WAITING_MEDIA_SAMPLE_LIMIT),
    ]);
    const error = jobResult.error ?? daemonResult.error;
    if (error) {
      // PostgREST hands back a plain object rather than an `Error`, which
      // `errorMessage` would flatten to "Unknown error" and strip the one
      // detail an operator needs.
      throw new Error(error.message);
    }

    const { jobs, invalidRows } = toJobs(jobResult.data, input.now);
    // A queue where nothing parsed is a reader that no longer matches the
    // table, not a queue with nothing in it. Reporting it as "no pending
    // lanes" would hand back a green publish queue built out of a broken
    // read, so the whole reading is thrown away instead.
    if (jobs.length === 0 && invalidRows > 0) {
      throw new Error(
        `Supabase returned ${invalidRows} social publish jobs in an unknown shape`,
      );
    }
    const daemon = toDaemon(daemonResult.data, jobs, input.now);
    return {
      generatedAt: input.now.toISOString(),
      daemon,
      jobs,
      waitingMedia: toWaitingMedia(waitingResult),
      invalidJobRows: invalidRows,
      message: null,
    };
  } catch (error) {
    return emptyResponse(input.now, errorMessage(error));
  }
}

export function deriveSocialSignals(
  response: OperationsSocialResponse,
  now: Date,
): OperationalSignal[] {
  if (response.message === UNCONFIGURED_MESSAGE) {
    return [
      unknownSignal({
        source: 'social-queue',
        domain: 'social',
        key: 'supabase',
        title: 'Social publish queue is not readable',
        detail:
          'No Supabase credentials, so neither the publish queue nor the ' +
          'daemon heartbeat can be read.',
        observedAt: now,
      }),
    ];
  }
  if (response.message !== null) {
    return [
      sourceFailure({
        source: 'social-queue',
        domain: 'social',
        error: response.message,
        observedAt: now,
      }),
    ];
  }
  return [
    daemonSignal(response, now),
    queueSignal(response, now),
    waitingMediaSignal(response, now),
  ];
}

function daemonSignal(
  response: OperationsSocialResponse,
  now: Date,
): OperationalSignal {
  const { daemon } = response;
  return buildSignal({
    source: 'social-daemon',
    domain: 'social',
    kind: 'heartbeat',
    key: DAEMON_STATE_ID,
    status: daemon.status,
    title: DAEMON_TITLE[daemon.status],
    detail: DAEMON_DETAIL[daemon.status],
    evidence: {
      staleMinutes: daemon.staleMinutes,
      owner: daemon.owner,
      lastError: daemon.lastError,
      overdueJobs: overdueJobs(response.jobs).length,
    },
    observedAt: now,
  });
}

function queueSignal(
  response: OperationsSocialResponse,
  now: Date,
): OperationalSignal {
  // Exhausted lanes are listed alongside overdue ones even when their due
  // time is still in the grace window: the claim query has already given up
  // on them, so waiting longer changes nothing.
  const blocked = response.jobs.filter(
    (job) => job.attemptsExhausted || job.overdueMinutes !== null,
  );
  const unread = response.invalidJobRows;
  if (blocked.length === 0) {
    // Nothing blocked among the lanes that parsed is only good news if every
    // lane parsed. Otherwise the lanes nobody could read are exactly the ones
    // this signal cannot vouch for, so it says so rather than reporting green.
    return buildSignal({
      source: 'social-queue',
      domain: 'social',
      kind: 'overdue',
      key: 'queue',
      status: unread === 0 ? 'healthy' : 'degraded',
      title:
        unread === 0
          ? 'Publish queue is on schedule'
          : 'Publish queue is only partly readable',
      detail: unread === 0 ? null : unreadRowsDetail(unread),
      evidence: {
        pendingJobs: response.jobs.length,
        overdueJobs: 0,
        invalidRowCount: unread,
      },
      observedAt: now,
    });
  }

  const worst = blocked.reduce(worseJob);
  const detail = worst.attemptsExhausted
    ? `The ${worst.platform} lane for episode ${worst.episodeId} has used ` +
      `all ${MAX_ATTEMPTS} attempts and will never be claimed again.`
    : `The ${worst.platform} lane for episode ${worst.episodeId} is past ` +
      'its publish window.';
  return buildSignal({
    source: 'social-queue',
    domain: 'social',
    kind: 'overdue',
    key: 'queue',
    status: worst.attemptsExhausted ? 'critical' : 'degraded',
    title: worst.attemptsExhausted
      ? 'Publish lane is out of retries'
      : 'Publish queue is overdue',
    // The worst lane on record still leads, but an operator reading it needs
    // to know it is only the worst of what could be read.
    detail: unread === 0 ? detail : `${detail} ${unreadRowsDetail(unread)}`,
    evidence: {
      overdueMinutes: worst.overdueMinutes,
      episodeId: worst.episodeId,
      platform: worst.platform,
      attemptsExhausted: worst.attemptsExhausted,
      overdueJobs: blocked.length,
      invalidRowCount: unread,
    },
    observedAt: now,
  });
}

function unreadRowsDetail(unread: number): string {
  return (
    `${unread} queue ${unread === 1 ? 'row' : 'rows'} failed to parse, so ` +
    'this reading of the queue is incomplete.'
  );
}

function waitingMediaSignal(
  response: OperationsSocialResponse,
  now: Date,
): OperationalSignal {
  const media = response.waitingMedia;
  const common = {
    source: 'social-queue',
    domain: 'social',
    kind: 'waiting-media',
    key: 'episodes',
    observedAt: now,
  } as const;

  // A view nobody could read has not reported that nothing is stuck. This is
  // the deploy window where the reader has shipped ahead of the migration.
  if (media.lanes === null) {
    return buildSignal({
      ...common,
      status: 'unknown',
      title: 'Waiting media is not readable',
      detail:
        `${media.message ?? 'The waiting-media view could not be read'}. ` +
        'Lane age and producer eligibility are unobserved this cycle.',
      evidence: {
        waitingMediaLanes: null,
        oldestWaitingHours: null,
        blockedWaitingLanes: null,
        waitingMediaRowsRead: 0,
        invalidWaitingMediaRows: media.invalidRows,
      },
    });
  }

  const oldestWaitingHours =
    media.oldestWaitingSince === null
      ? null
      : Math.max(
          0,
          (now.getTime() - Date.parse(media.oldestWaitingSince)) / 3_600_000,
        );
  const blocked = media.blockedLanes > 0;
  const stale = (oldestWaitingHours ?? 0) > WAITING_MEDIA_STALE_HOURS;
  const degraded =
    media.lanes >= WAITING_MEDIA_FLOOR || stale || media.invalidRows > 0;
  const oldestLane =
    media.oldestEpisodeId === null
      ? 'the oldest lane'
      : `episode ${media.oldestEpisodeId}` +
        (media.oldestLanguageCode === null
          ? ''
          : ` (${media.oldestLanguageCode})`);
  const partial =
    media.invalidRows > 0
      ? ` ${unreadWaitingRowsDetail(media.invalidRows)}`
      : '';

  return buildSignal({
    ...common,
    status: blocked ? 'critical' : degraded ? 'degraded' : 'healthy',
    title: blocked
      ? 'Publish lanes are waiting on video no worker can render'
      : degraded
        ? 'Publish lanes are waiting on rendered video'
        : 'Media for the publish queue is keeping up',
    detail: blocked
      ? `${media.blockedLanes} of ${media.rowsRead} sampled lanes cannot be ` +
        `claimed by a render worker, so they will never finish on their own; ` +
        `${oldestLane} has waited ${Math.round(oldestWaitingHours ?? 0)}h.` +
        partial
      : degraded
        ? `${media.lanes} publish lanes have no finished video, so no job can ` +
          `be queued for them yet; ${oldestLane} has waited ` +
          `${Math.round(oldestWaitingHours ?? 0)}h.` +
          partial
        : null,
    evidence: {
      waitingMediaLanes: media.lanes,
      oldestWaitingHours,
      blockedWaitingLanes: media.blockedLanes,
      waitingMediaRowsRead: media.rowsRead,
      invalidWaitingMediaRows: media.invalidRows,
      oldestWaitingEpisodeId: media.oldestEpisodeId,
    },
  });
}

function unreadWaitingRowsDetail(unread: number): string {
  return (
    ` ${unread} waiting-media ${unread === 1 ? 'row' : 'rows'} failed to ` +
    'parse, so this reading is incomplete.'
  );
}

/**
 * "Worse" puts an exhausted lane ahead of any merely late one, because a late
 * lane still publishes on its own and an exhausted one never will.
 */
function worseJob(
  left: OperationsSocialJob,
  right: OperationsSocialJob,
): OperationsSocialJob {
  if (left.attemptsExhausted !== right.attemptsExhausted) {
    return left.attemptsExhausted ? left : right;
  }
  return (right.overdueMinutes ?? 0) > (left.overdueMinutes ?? 0)
    ? right
    : left;
}

function overdueJobs(jobs: OperationsSocialJob[]): OperationsSocialJob[] {
  return jobs.filter((job) => job.overdueMinutes !== null);
}

/**
 * Turn one read of `social_waiting_media` into what it can honestly claim.
 *
 * Every failure mode here degrades this reading alone. The publish queue and the
 * daemon heartbeat come from different tables in the same round trip, and losing
 * the age dimension must never cost an operator the other two.
 */
function toWaitingMedia(result: {
  data: unknown[] | null;
  count: number | null;
  error: { message: string } | null;
}): OperationsSocialWaitingMedia {
  if (result.error) {
    return unreadWaitingMedia(result.error.message);
  }

  const rows = result.data ?? [];
  const parsed = rows.flatMap((row) => {
    const candidate = waitingRowSchema.safeParse(row);
    return candidate.success ? [candidate.data] : [];
  });
  const invalidRows = rows.length - parsed.length;

  // Rows that exist but none of which parse is a reader that no longer matches
  // the view, not a view with nothing in it. Reporting "nothing is waiting" from
  // a broken read is the exact green-from-nothing this signal exists to prevent.
  if (parsed.length === 0 && rows.length > 0) {
    return unreadWaitingMedia(
      `Supabase returned ${rows.length} waiting-media ` +
        `${rows.length === 1 ? 'row' : 'rows'} in an unknown shape`,
    );
  }

  // The request orders oldest-first, so the oldest lane is in the sample even
  // when the view was truncated.
  const oldest = parsed[0] ?? null;

  return {
    lanes: result.count ?? parsed.length,
    rowsRead: parsed.length,
    oldestWaitingSince: oldest?.waiting_since ?? null,
    oldestEpisodeId: oldest?.episode_id ?? null,
    oldestLanguageCode: oldest?.language_code ?? null,
    blockedLanes: parsed.filter(renderWorkerCannotClaim).length,
    invalidRows,
    message: null,
  };
}

/**
 * Whether no render worker will ever pick this lane up without an operator.
 *
 * Mirrors `claim_episode_video_v2`, which requires a queued row under the
 * attempt ceiling whose visual checkpoint is completed and matches on BOTH hash
 * and version, and `fail_episode_video`, which only writes `failed` once the
 * attempts are spent — so `failed` is terminal until `retry_episode_video_render`
 * resets it. The version and checkpoint judgement itself is not re-implemented
 * here: it belongs to `podcast-retry-eligibility.ts`, which three other read
 * models already share.
 *
 * Deliberately not modelled: `podcast_deployment_claims_open()`. A closed
 * deployment gate makes every lane unclaimable for the minutes a deploy drains,
 * which is far below the age at which this reading becomes interesting.
 */
function renderWorkerCannotClaim(
  row: z.infer<typeof waitingRowSchema>,
): boolean {
  return (
    row.render_status === null ||
    row.render_status === 'failed' ||
    (row.render_attempt_count ?? 0) >= MAX_RENDER_ATTEMPTS ||
    !visualIsRenderable(row.visual_status, row.visual_version) ||
    !isCurrentVisualVersion(row.render_visual_version) ||
    row.render_visual_hash === null ||
    row.render_visual_hash !== row.visual_hash
  );
}

function toJobs(
  rows: unknown[] | null,
  now: Date,
): { jobs: OperationsSocialJob[]; invalidRows: number } {
  const source = rows ?? [];
  const jobs = source.flatMap((row) => {
    const parsed = jobRowSchema.safeParse(row);
    // One malformed lane must not blank the whole panel: the operator still
    // needs to see the lanes that did parse. What was dropped leaves with the
    // count, so the caller can weigh how much of the queue this reading is
    // actually speaking for.
    if (!parsed.success) {
      return [];
    }
    const job = parsed.data;
    // `claim_social_publish_batch` gates on `scheduled_at <= now` AND
    // `next_attempt_at <= now`, so the earliest a lane can move is the later
    // of the two; measuring from `scheduled_at` alone reports a backed-off
    // lane as overdue while the claim is correctly skipping it.
    const dueAt = Math.max(
      Date.parse(job.scheduled_at),
      Date.parse(job.next_attempt_at),
    );
    const minutesPastDue = (now.getTime() - dueAt) / 60_000;
    return [
      {
        episodeId: job.episode_id,
        platform: job.platform,
        languageCode: job.language_code ?? null,
        status: job.status,
        scheduledAt: job.scheduled_at,
        nextAttemptAt: job.next_attempt_at,
        attemptCount: job.attempt_count,
        overdueMinutes:
          minutesPastDue > JOB_GRACE_MINUTES
            ? Math.round(minutesPastDue)
            : null,
        attemptsExhausted: job.attempt_count >= MAX_ATTEMPTS,
      },
    ];
  });
  return { jobs, invalidRows: source.length - jobs.length };
}

function toDaemon(
  row: unknown,
  jobs: OperationsSocialJob[],
  now: Date,
): OperationsSocialDaemon {
  const parsed = daemonRowSchema.safeParse(row);
  if (!parsed.success) {
    return unknownDaemon();
  }
  const state = parsed.data;
  const lastTickStartedAt = state.last_tick_started_at ?? null;
  const staleMinutes =
    lastTickStartedAt === null
      ? null
      : Math.round((now.getTime() - Date.parse(lastTickStartedAt)) / 60_000);
  return {
    status: daemonStatus(staleMinutes, overdueJobs(jobs).length > 0),
    owner: state.owner ?? null,
    daemonVersion: state.daemon_version ?? null,
    firstStartedAt: state.first_started_at ?? null,
    lastTickStartedAt,
    lastTickCompletedAt: state.last_tick_completed_at ?? null,
    lastSuccessAt: state.last_success_at ?? null,
    lastError: state.last_error ?? null,
    staleMinutes,
  };
}

/**
 * A silent daemon on an empty queue is a nuisance; a silent daemon with lanes
 * already past their window is an outage, because those slots are being
 * missed while nobody is watching.
 */
function daemonStatus(
  staleMinutes: number | null,
  hasOverdueJob: boolean,
): OperationalStatus {
  if (staleMinutes === null) {
    return 'unknown';
  }
  if (staleMinutes < DAEMON_STALE_MINUTES) {
    return 'healthy';
  }
  return hasOverdueJob ? 'critical' : 'degraded';
}

function emptyResponse(now: Date, message: string): OperationsSocialResponse {
  return {
    generatedAt: now.toISOString(),
    daemon: unknownDaemon(),
    jobs: [],
    waitingMedia: unreadWaitingMedia(message),
    invalidJobRows: 0,
    message,
  };
}

function unreadWaitingMedia(message: string): OperationsSocialWaitingMedia {
  return {
    lanes: null,
    rowsRead: 0,
    oldestWaitingSince: null,
    oldestEpisodeId: null,
    oldestLanguageCode: null,
    blockedLanes: 0,
    invalidRows: 0,
    message,
  };
}

function unknownDaemon(): OperationsSocialDaemon {
  return {
    status: 'unknown',
    owner: null,
    daemonVersion: null,
    firstStartedAt: null,
    lastTickStartedAt: null,
    lastTickCompletedAt: null,
    lastSuccessAt: null,
    lastError: null,
    staleMinutes: null,
  };
}
