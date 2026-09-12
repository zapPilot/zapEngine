import { describe, expect, it } from 'vitest';

import type { CostProviderResult } from '../shared/types.js';
import {
  costBasisLabel,
  excludedDailyProviders,
  excludedNote,
  excludedProviders,
  exclusionNotes,
} from './cost-basis.js';

function provider(
  overrides: Partial<CostProviderResult> = {},
): CostProviderResult {
  return {
    provider: 'fly',
    label: 'Fly.io',
    status: 'ok',
    costType: 'estimated',
    snapshot: null,
    message: null,
    ...overrides,
  };
}

describe('costBasisLabel', () => {
  it('names the list-price vocabulary outright', () => {
    expect(costBasisLabel('list-price-equivalent')).toBe(
      'List-price equivalent',
    );
  });

  it('separates recorded bills from run-rates', () => {
    expect(costBasisLabel('estimated', 'manual')).toBe('Estimated · manual');
    expect(costBasisLabel('estimated', 'scraped')).toBe(
      'Estimated · dashboard',
    );
  });

  it('reads an unrecorded estimate as a run-rate', () => {
    expect(costBasisLabel('estimated', 'api')).toBe('Estimated · run-rate');
    expect(costBasisLabel('estimated')).toBe('Estimated · run-rate');
  });

  it('humanizes any other cost type', () => {
    expect(costBasisLabel('actual')).toBe('Actual');
    expect(costBasisLabel('fixed')).toBe('Fixed');
  });
});

describe('excludedProviders', () => {
  it('excludes nothing when every provider prices', () => {
    const priced = provider({
      snapshot: {
        provider: 'fly',
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-09-17T00:00:00.000Z',
        accruedCostUsd: 14,
        projectedCostUsd: 14,
        costType: 'estimated',
        source: 'manual',
        usage: [],
        fetchedAt: '2026-09-17T00:00:00.000Z',
      } as never,
    });
    expect(excludedProviders([priced])).toEqual([]);
  });

  it('names a provider with no snapshot as nothing recorded', () => {
    const entries = excludedProviders([
      provider({ label: 'Fly.io', message: 'Not connected' }),
    ]);
    expect(entries).toEqual([
      {
        label: 'Fly.io',
        qualifier: 'nothing recorded',
        reason: 'Not connected',
      },
    ]);
  });

  it('qualifies an unpriced run-rate differently from an unknown cost', () => {
    const entries = excludedProviders([
      provider({
        label: 'Fly.io',
        costType: 'estimated',
        message: 'Compute run-rate only',
        snapshot: { accruedCostUsd: null, projectedCostUsd: null } as never,
      }),
      provider({
        provider: 'openrouter',
        label: 'OpenRouter',
        costType: 'actual',
        message: 'Usage synced; USD cost unknown',
        snapshot: { accruedCostUsd: null, projectedCostUsd: null } as never,
      }),
    ]);
    expect(entries).toEqual([
      {
        label: 'Fly.io',
        qualifier: 'run-rate only',
        reason: 'Compute run-rate only',
      },
      {
        label: 'OpenRouter',
        qualifier: 'cost unknown',
        reason: 'Usage synced; USD cost unknown',
      },
    ]);
  });
});

describe('excludedDailyProviders', () => {
  it('flags only the days with no amount', () => {
    const entries = excludedDailyProviders([
      { label: 'Fly.io', costType: 'estimated', accruedCostUsd: null },
      { label: 'OpenRouter', costType: 'actual', accruedCostUsd: 0.4 },
    ] as never);
    expect(entries).toEqual([
      { label: 'Fly.io', qualifier: 'run-rate only', reason: null },
    ]);
  });
});

describe('excludedNote', () => {
  it('returns null when nothing is excluded', () => {
    expect(excludedNote([])).toBeNull();
  });

  it('groups providers by qualifier', () => {
    expect(
      excludedNote([
        { label: 'Fly.io', qualifier: 'run-rate only', reason: null },
        { label: 'DeBank', qualifier: 'cost unknown', reason: null },
        { label: 'Brave Search', qualifier: 'cost unknown', reason: null },
      ]),
    ).toBe(
      'Excluded: Fly.io (run-rate only); DeBank, Brave Search (cost unknown)',
    );
  });
});

describe('exclusionNotes', () => {
  it('lists one short line per excluded provider', () => {
    expect(
      exclusionNotes([
        provider({
          label: 'Fly.io',
          costType: 'estimated',
          snapshot: { accruedCostUsd: null, projectedCostUsd: null } as never,
        }),
      ]),
    ).toEqual(['Excludes Fly.io (run-rate only)']);
  });
});
