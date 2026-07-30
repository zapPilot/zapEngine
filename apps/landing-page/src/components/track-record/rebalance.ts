import type { DailySnapshot } from '@zapengine/types/strategy';

export function hasRebalance(snapshot: DailySnapshot): boolean {
  return snapshot.transactions.some(
    (transaction) => transaction.type === 'rebalance',
  );
}
