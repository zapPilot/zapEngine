import { hasKeyword, planRequest, rationale } from './demoRule.js';
import type { Action, Store } from './types.js';

export async function decide(
  store: Store,
  action: Action,
  recognize: (
    title: string,
    text: string,
  ) => Promise<{ matches: boolean; evidence: string }>,
  model: string,
  wallet: `0x${string}`,
  now = Date.now(),
): Promise<void> {
  if (Date.parse(action.next_attempt_at) > now) return;
  const episode = await store.episode(action.episode_id);
  const updated_at = new Date(now).toISOString();
  if (!hasKeyword(episode.title, episode.raw_text)) {
    await store.cas(action, {
      status: 'skipped',
      last_error: 'No Bitget keyword',
      updated_at,
    });
    return;
  }
  try {
    const result = await recognize(episode.title, episode.raw_text);
    await store.cas(action, {
      status: result.matches ? 'approved' : 'skipped',
      decision: {
        model,
        evidence: result.evidence,
        rationale,
        action: planRequest(wallet),
      },
      wallet_address: wallet,
      attempt_count: 0,
      last_error: null,
      updated_at,
    });
  } catch {
    const attempt_count = action.attempt_count + 1;
    await store.cas(action, {
      status: attempt_count >= 3 ? 'skipped' : 'pending',
      attempt_count,
      next_attempt_at: new Date(
        now + 30_000 * 2 ** attempt_count,
      ).toISOString(),
      last_error: 'Recognition failed',
      updated_at,
    });
  }
}
