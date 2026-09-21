import { refreshPortfolioQueryCaches } from '@core/lib/state/portfolioQueryRefresh';
import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

function createClient() {
  return { invalidateQueries: vi.fn() } as unknown as QueryClient;
}

function invalidatedKeys(client: QueryClient) {
  return vi
    .mocked(client.invalidateQueries)
    .mock.calls.map(([options]) => options?.queryKey);
}

describe('refreshPortfolioQueryCaches', () => {
  it('invalidates every home query slice for a user', async () => {
    const client = createClient();

    await refreshPortfolioQueryCaches(client, 'user-1');

    expect(invalidatedKeys(client)).toEqual([
      ['portfolio'],
      ['portfolio-dashboard', 'user-1'],
      ['dailyYield', 'user-1'],
      ['desktop', 'portfolio', 'dailyYield', 'user-1'],
      ['desktop', 'strategy-suggestion', 'user-1'],
    ]);
  });

  it('falls back to the global portfolio slice without a user', async () => {
    const client = createClient();

    await refreshPortfolioQueryCaches(client, null);

    expect(invalidatedKeys(client)).toEqual([['portfolio']]);
  });

  it('can spare the landing-page slice that triggered the refresh', async () => {
    const client = createClient();

    await refreshPortfolioQueryCaches(client, 'user-1', {
      excludeLandingPage: true,
    });

    const [portfolioCall] = vi.mocked(client.invalidateQueries).mock.calls;
    const predicate = portfolioCall?.[0]?.predicate;
    expect(predicate).toBeTypeOf('function');
    const matches = (queryKey: readonly unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      predicate!({ queryKey } as any);

    expect(matches(['portfolio', 'landing-page', 'user-1'])).toBe(false);
    expect(matches(['portfolio', 'yield-summary', 'user-1', 'bundle'])).toBe(
      true,
    );
    expect(matches(['portfolio', 'borrowing-positions', 'user-1'])).toBe(true);
  });
});
