import { describe, expect, it } from 'vitest';
import {
  activityEventMatchesFilter,
  classifyKind,
  computeNetDeltas,
  filterActivityGroups,
  mapMoralisEvent,
  summarizeCategoryFlows,
} from '../src/integration/activityEventModel';

const transfer = (
  direction: 'receive' | 'send',
  overrides: Record<string, unknown> = {},
) =>
  ({
    symbol: 'USDC',
    direction,
    amount: direction === 'receive' ? 1 : -1,
    usd: direction === 'receive' ? 1 : -1,
    ...overrides,
  }) as never;

describe('coverage handoff: activity model boundaries', () => {
  it('classifies empty, one-way, and two-way activity', () => {
    expect(classifyKind([])).toBeNull();
    expect(classifyKind([transfer('receive')])).toBe('deposit');
    expect(classifyKind([transfer('send')])).toBe('withdraw');
    expect(classifyKind([transfer('receive'), transfer('send')])).toBe(
      'rebalance',
    );
  });

  it('aggregates duplicate symbols while preserving unknown USD values', () => {
    const result = computeNetDeltas([
      { symbol: 'USDC', amount: 2, usd: null },
      { symbol: 'USDC', amount: -1, usd: null },
      { symbol: 'ETH', amount: 1, usd: 3_000 },
    ] as never);
    expect(result.find((item) => item.category === 'stable')).toMatchObject({
      usdNet: null,
    });
    expect(result[0]?.category).toBe('eth');
  });

  it('sorts equal magnitudes deterministically and prefers known USD', () => {
    const result = computeNetDeltas([
      { symbol: 'BTC', amount: 1, usd: 10 },
      { symbol: 'ETH', amount: 1, usd: -10 },
      { symbol: 'USDC', amount: 5, usd: null },
    ] as never);
    expect(result.map((item) => item.category)).toEqual([
      'btc',
      'eth',
      'stable',
    ]);
  });

  it('computes category touch shares without counting a category twice per event', () => {
    const events = [
      {
        symbolDeltas: [
          { symbol: 'BTC', amount: 1, usd: 10 },
          { symbol: 'BTC', amount: 2, usd: 20 },
          { symbol: 'USDC', amount: -30, usd: -30 },
        ],
      },
    ] as never;
    const flows = summarizeCategoryFlows(events);
    expect(flows.find((flow) => flow.category === 'btc')?.share).toBe(0.5);
    expect(flows.find((flow) => flow.category === 'stable')?.share).toBe(0.5);
  });

  it('filters event groups and removes groups left empty', () => {
    const btcEvent = {
      categoryDeltas: [{ category: 'btc', usdNet: 1, label: '+1 BTC' }],
    } as never;
    const stableEvent = {
      categoryDeltas: [{ category: 'stable', usdNet: 1, label: '+1 USDC' }],
    } as never;
    const groups = [
      { label: 'first', events: [btcEvent, stableEvent] },
      { label: 'second', events: [stableEvent] },
    ] as never;
    expect(activityEventMatchesFilter(btcEvent, 'All')).toBe(true);
    expect(activityEventMatchesFilter(btcEvent, 'stable')).toBe(false);
    expect(filterActivityGroups(groups, 'All')).not.toBe(groups);
    expect(filterActivityGroups(groups, 'btc')).toEqual([
      { label: 'first', events: [btcEvent] },
    ]);
  });

  it('maps interaction-only activity and handles invalid timestamps', () => {
    const event = mapMoralisEvent(
      { moralis: 'arbitrum', desktop: 'arbitrum', label: 'Arbitrum' },
      {
        hash: '0xinteraction',
        block_timestamp: 'invalid',
        receipt_status: '0',
        method_label: ' supply ',
        erc20_transfers: [],
        native_transfers: [],
      } as never,
    );
    expect(event).toMatchObject({
      kind: 'contract-interaction',
      title: 'supply',
      status: 'Failed',
      timestamp: 0,
      methodLabel: 'supply',
    });
  });

  it('rejects spam and metadata-free events', () => {
    const context = {
      moralis: 'arbitrum',
      desktop: 'arbitrum',
      label: 'Arbitrum',
    } as const;
    expect(
      mapMoralisEvent(context, { hash: 'spam', possible_spam: true } as never),
    ).toBeNull();
    expect(mapMoralisEvent(context, { hash: 'empty' } as never)).toBeNull();
  });
});
