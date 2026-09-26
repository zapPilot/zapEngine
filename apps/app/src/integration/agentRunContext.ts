/**
 * The news agent has no backend of its own, so the story it read travels in
 * the dashboard link it prints and sends to Telegram (`/ai-wallet?episode=…`).
 * Transactions are always read from chain; only the story comes from the URL,
 * or from the local agent's run status in local dev.
 */
import type { AgentRunStatus } from '@zapengine/types/api';

type SearchParams = Partial<Record<string, string | string[]>>;

const EPISODE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRunEpisodeId(params: SearchParams): string | null {
  const value = params['episode'];
  const episode = Array.isArray(value) ? value[0] : value;
  return episode !== undefined && EPISODE_ID_PATTERN.test(episode)
    ? episode
    : null;
}

/**
 * A run in progress shows its own story; otherwise the run link wins, and a
 * finished local run fills in when the page was opened without one.
 */
export function storyEpisodeId({
  urlEpisodeId,
  run,
}: {
  urlEpisodeId: string | null;
  run: AgentRunStatus | null;
}): string | null {
  const runEpisode = run === null || run.state === 'idle' ? null : run.episode;
  const candidate =
    run?.state === 'running' ? runEpisode : (urlEpisodeId ?? runEpisode);
  return candidate === null ? null : parseRunEpisodeId({ episode: candidate });
}
