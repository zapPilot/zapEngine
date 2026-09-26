import type { Store } from './types.js';
export async function discover(
  store: Store,
  rule: string,
  since: string,
  episode?: string,
): Promise<void> {
  for (const row of await store.discover(since, episode))
    await store.insert(row.id, rule);
}
