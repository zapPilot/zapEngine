import { errorMessage } from '../lib/errorMessage.js';
import { capturePipelineException } from '../observability/sentry.js';
import {
  getPipelineSupabase,
  throwSupabaseError,
} from '../services/supabase-client.js';
import { SOCIAL_DAEMON_STATE_ID } from './daemon-store.js';

/**
 * Stamped on every heartbeat so a stale row can be attributed to the build that
 * wrote it. The daemon runs on a laptop with no deploy record anywhere, so
 * without this column an old process left running is indistinguishable from a
 * current one that stopped ticking.
 */
const DAEMON_VERSION = 'social-daemon-v1';

/**
 * `last_error` is unbounded `text`, and a failing publish can carry an entire
 * HTML error page as its message. Truncating keeps one broken tick from writing
 * a multi-megabyte row that every dashboard read then has to pull down.
 */
const MAX_ERROR_LENGTH = 4_000;

interface SocialDaemonTickHeartbeat {
  phase: 'start' | 'success' | 'error';
  now: Date;
  owner: string;
  error?: unknown;
}

/**
 * Writes the daemon's liveness row for one tick.
 *
 * Every failure is swallowed. The publisher is the process of record and this
 * write is only telemetry, so a Supabase blip here must never abort a release
 * cohort mid-flight -- that would trade an unobserved daemon for a
 * half-published one. The failure still reaches Sentry as a warning, because a
 * heartbeat that silently stops writing looks exactly like a daemon that died,
 * which is the confusion these columns exist to end.
 */
export async function recordSocialDaemonTick(
  input: SocialDaemonTickHeartbeat,
): Promise<void> {
  try {
    const { error } = await getPipelineSupabase()
      .from('social_daemon_state')
      .update(heartbeatPatch(input))
      .eq('id', SOCIAL_DAEMON_STATE_ID);
    if (error) throwSupabaseError(error);
  } catch (failure) {
    console.error(
      `⚠️ [social-daemon] heartbeat ${input.phase} failed · ${errorMessage(failure)}`,
    );
    capturePipelineException(failure, {
      component: 'social-daemon',
      tags: { operation: 'heartbeat' },
      context: { phase: input.phase, owner: input.owner },
      level: 'warning',
    });
  }
}

function heartbeatPatch(
  input: SocialDaemonTickHeartbeat,
): Record<string, string | null> {
  // Whatever clock the caller read. `start` passes the tick's own start time
  // and the terminal phases pass the completion time, so the gap between the
  // two columns is the tick's real duration — a tick that took forty minutes
  // has to be distinguishable from one that took a second.
  const at = input.now.toISOString();

  if (input.phase === 'start') {
    return {
      last_tick_started_at: at,
      owner: input.owner,
      daemon_version: DAEMON_VERSION,
      updated_at: at,
    };
  }

  if (input.phase === 'success') {
    return {
      last_tick_completed_at: at,
      last_success_at: at,
      // A stale message left beside a fresh success reads as a daemon that is
      // still broken, and a false alarm that never clears trains the reader to
      // ignore the column.
      last_error: null,
      updated_at: at,
    };
  }

  return {
    last_tick_completed_at: at,
    last_error: errorMessage(input.error).slice(0, MAX_ERROR_LENGTH),
    updated_at: at,
  };
}
