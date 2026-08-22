import type {
  MoralisWalletHistoryEvent,
  MoralisWalletTransfer,
} from '@zapengine/app-core/services';
import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_FILTERS,
  type ActivityCategoryDelta,
  type ActivityGroup,
} from '@/data/demo';
import {
  activityEventMatchesFilter,
  classifyKind,
  collectSupportedTransfers,
  computeNetDeltas,
  filterActivityGroups,
  mapMoralisEvent,
  summarizeCategoryFlows,
  type ActivityChainContext,
  type MappedActivityEvent,
  type SupportedActivityTransfer,
} from '@/integration/activityEventModel';

const ARBITRUM: ActivityChainContext = {
  moralis: 'arbitrum',
  desktop: 'arbitrum',
  label: 'Arbitrum',
};

const USDC_ARB = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const WBTC_ARB = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f';
const CBBTC_ARB = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';
const SPOOF_ADDRESS = '0x0000000000000000000000000000000000000001';
const BASE_TS = Date.parse('2026-08-10T12:00:00.000Z');

function typedTransfer(
  overrides: Partial<MoralisWalletTransfer>,
): MoralisWalletTransfer {
  return { ...overrides } as MoralisWalletTransfer;
}

function runtimeAddressTransfer(
  overrides: Partial<MoralisWalletTransfer> & { address: string },
): MoralisWalletTransfer {
  return { ...overrides } as MoralisWalletTransfer;
}

function historyEvent(
  overrides: Partial<MoralisWalletHistoryEvent> = {},
): MoralisWalletHistoryEvent {
  return {
    hash: '0xhash',
    block_timestamp: '2026-08-10T06:43:10.000Z',
    receipt_status: '1',
    ...overrides,
  };
}

function supportedTransfer(
  direction: SupportedActivityTransfer['direction'],
  overrides: Partial<SupportedActivityTransfer> = {},
): SupportedActivityTransfer {
  return {
    symbol: 'USDC',
    direction,
    amount: direction === 'receive' ? 1 : -1,
    usd: direction === 'receive' ? 1 : -1,
    ...overrides,
  };
}

function mappedEvent(
  overrides: Partial<MappedActivityEvent> & Pick<MappedActivityEvent, 'hash'>,
): MappedActivityEvent {
  const { hash, ...rest } = overrides;

  return {
    id: `arbitrum-${hash}`,
    hash,
    sourceChain: 'arbitrum',
    kind: 'rebalance',
    title: 'Stable → BTC',
    amountLabel: '+$100.00',
    amountTone: 'positive',
    status: 'Completed',
    meta: 'Arbitrum',
    time: '',
    category: 'btc',
    categoryDeltas: [
      { category: 'btc', usdNet: 100, label: '+0.001 CBBTC' },
      { category: 'stable', usdNet: -100, label: '−100 USDC' },
    ],
    chain: 'arbitrum',
    tokenSymbol: 'CBBTC',
    timestamp: BASE_TS,
    symbolDeltas: [
      { symbol: 'USDC', amount: -100, usd: -100 },
      { symbol: 'CBBTC', amount: 0.001, usd: 100 },
    ],
    ...rest,
  };
}

describe('collectSupportedTransfers', () => {
  it('collects every supported ERC-20 and native transfer with wallet-relative signs', () => {
    const result = collectSupportedTransfers(
      'arbitrum',
      historyEvent({
        erc20_transfers: [
          runtimeAddressTransfer({
            address: USDC_ARB,
            token_symbol: 'USDC',
            direction: ' receive ',
            value_formatted: '12.5',
            value_usd: '12.50',
          }),
          typedTransfer({
            token_address: WBTC_ARB,
            token_symbol: 'WBTC',
            direction: 'SEND',
            value_formatted: '0.002',
            total_usd: '120',
          }),
        ],
        native_transfers: [
          typedTransfer({
            direction: 'receive',
            value_formatted: 1,
            value_usd: 3000,
          }),
        ],
      }),
    );

    expect(result).toEqual([
      {
        symbol: 'USDC',
        direction: 'receive',
        amount: 12.5,
        usd: 12.5,
      },
      {
        symbol: 'WBTC',
        direction: 'send',
        amount: -0.002,
        usd: -120,
      },
      {
        symbol: 'ETH',
        direction: 'receive',
        amount: 1,
        usd: 3000,
      },
    ]);
  });

  it('prefers value_usd and falls back to total_usd', () => {
    const result = collectSupportedTransfers(
      'arbitrum',
      historyEvent({
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '5',
            value_usd: '5',
            total_usd: '500',
          }),
          typedTransfer({
            token_address: WBTC_ARB,
            token_symbol: 'WBTC',
            direction: 'send',
            value_formatted: '0.001',
            value_usd: 'not-a-number',
            total_usd: '60',
          }),
        ],
      }),
    );

    expect(result.map((transfer) => transfer.usd)).toEqual([5, -60]);
  });

  it('retains a supported transfer with unknown USD value', () => {
    const result = collectSupportedTransfers(
      'arbitrum',
      historyEvent({
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '9',
          }),
        ],
      }),
    );

    expect(result).toEqual([
      {
        symbol: 'USDC',
        direction: 'receive',
        amount: 9,
        usd: null,
      },
    ]);
  });

  it.each([undefined, '', '   ', 'in', 'out', 'sideways'])(
    'skips direction %j instead of guessing wallet perspective',
    (direction) => {
      const result = collectSupportedTransfers(
        'arbitrum',
        historyEvent({
          erc20_transfers: [
            typedTransfer({
              token_address: USDC_ARB,
              token_symbol: 'USDC',
              direction,
              value_formatted: '10',
            }),
          ],
        }),
      );

      expect(result).toEqual([]);
    },
  );

  it('drops same-symbol spoof contracts from both Moralis address shapes', () => {
    const result = collectSupportedTransfers(
      'arbitrum',
      historyEvent({
        erc20_transfers: [
          runtimeAddressTransfer({
            address: SPOOF_ADDRESS,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '7221',
          }),
          typedTransfer({
            token_address: SPOOF_ADDRESS,
            token_symbol: 'WBTC',
            direction: 'receive',
            value_formatted: '10',
          }),
        ],
      }),
    );

    expect(result).toEqual([]);
  });

  it('drops a payload symbol that disagrees with its canonical address', () => {
    const result = collectSupportedTransfers(
      'arbitrum',
      historyEvent({
        erc20_transfers: [
          typedTransfer({
            token_address: WBTC_ARB,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '10',
          }),
        ],
      }),
    );

    expect(result).toEqual([]);
  });

  it.each([undefined, '', 'not-a-number', '0', '-1'])(
    'skips non-positive or malformed amount %j',
    (value_formatted) => {
      const result = collectSupportedTransfers(
        'arbitrum',
        historyEvent({
          erc20_transfers: [
            typedTransfer({
              token_address: USDC_ARB,
              token_symbol: 'USDC',
              direction: 'receive',
              value_formatted,
            }),
          ],
        }),
      );

      expect(result).toEqual([]);
    },
  );

  it('normalizes cbBTC from a canonical contract to CBBTC', () => {
    const result = collectSupportedTransfers(
      'arbitrum',
      historyEvent({
        erc20_transfers: [
          typedTransfer({
            token_address: CBBTC_ARB,
            token_symbol: 'cbBTC',
            direction: 'receive',
            value_formatted: '0.25',
          }),
        ],
      }),
    );

    expect(result[0]?.symbol).toBe('CBBTC');
  });
});

describe('computeNetDeltas', () => {
  it('nets incoming and outgoing legs per symbol before rolling up categories', () => {
    const result = computeNetDeltas([
      { symbol: 'USDC', amount: 100, usd: 100 },
      { symbol: 'USDC', amount: -40, usd: -40 },
      { symbol: 'USDT', amount: 20, usd: null },
      { symbol: 'ETH', amount: -1, usd: -3000 },
    ]);

    expect(result).toEqual([
      { category: 'eth', usdNet: -3000, label: '−1 ETH' },
      {
        category: 'stable',
        usdNet: 60,
        label: '+60 USDC · +20 USDT',
      },
    ]);
  });

  it('aggregates every known USD leg when other legs are unpriced', () => {
    const result = computeNetDeltas([
      { symbol: 'USDC', amount: 25, usd: null },
      { symbol: 'USDT', amount: -5, usd: -5 },
      { symbol: 'USDC', amount: -10, usd: -10 },
    ]);

    expect(result).toEqual([
      {
        category: 'stable',
        usdNet: -15,
        label: '+15 USDC · −5 USDT',
      },
    ]);
  });

  it('keeps usdNet null when every leg in a category is unpriced', () => {
    const result = computeNetDeltas([
      { symbol: 'USDC', amount: 10, usd: null },
      { symbol: 'USDT', amount: -2, usd: null },
    ]);

    expect(result).toEqual([
      {
        category: 'stable',
        usdNet: null,
        label: '+10 USDC · −2 USDT',
      },
    ]);
  });

  it('retains a zero-net category as active', () => {
    const result = computeNetDeltas([
      { symbol: 'USDC', amount: 50, usd: 50 },
      { symbol: 'USDC', amount: -50, usd: -50 },
    ]);

    expect(result).toEqual([
      { category: 'stable', usdNet: 0, label: '+0 USDC' },
    ]);
  });

  it('rolls cbBTC and WBTC into the BTC allocation category', () => {
    const result = computeNetDeltas([
      { symbol: 'CBBTC', amount: 0.1, usd: 10 },
      { symbol: 'WBTC', amount: -0.05, usd: -5 },
    ]);

    expect(result).toEqual([
      {
        category: 'btc',
        usdNet: 5,
        label: '+0.1 CBBTC · −0.05 WBTC',
      },
    ]);
  });

  it('returns no deltas for an empty transfer list', () => {
    expect(computeNetDeltas([])).toEqual([]);
  });
});

describe('classifyKind', () => {
  it('classifies one or more receives as a deposit', () => {
    expect(
      classifyKind([
        supportedTransfer('receive'),
        supportedTransfer('receive', { symbol: 'ETH' }),
      ]),
    ).toBe('deposit');
  });

  it('classifies one or more sends as a withdrawal', () => {
    expect(
      classifyKind([
        supportedTransfer('send'),
        supportedTransfer('send', { symbol: 'ETH' }),
      ]),
    ).toBe('withdraw');
  });

  it('classifies mixed directions as a rebalance even when they net to zero', () => {
    expect(
      classifyKind([
        supportedTransfer('receive', { amount: 10, usd: 10 }),
        supportedTransfer('send', { amount: -10, usd: -10 }),
      ]),
    ).toBe('rebalance');
  });

  it('returns null when there are no supported transfers', () => {
    expect(classifyKind([])).toBeNull();
  });
});

describe('mapMoralisEvent', () => {
  it('maps a receive-only event to a positive deposit', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '50',
            value_usd: '50',
          }),
        ],
      }),
    );

    expect(event).toEqual(
      expect.objectContaining({
        id: 'arbitrum-0xhash',
        hash: '0xhash',
        sourceChain: 'arbitrum',
        kind: 'deposit',
        title: 'Received USDC',
        amountLabel: '+$50.00',
        amountTone: 'positive',
        category: 'stable',
        chain: 'arbitrum',
        tokenSymbol: 'USDC',
      }),
    );
  });

  it('maps a send-only event to a negative withdrawal', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        native_transfers: [
          typedTransfer({
            direction: 'send',
            value_formatted: '0.25',
            total_usd: '750',
          }),
        ],
      }),
    );

    expect(event).toEqual(
      expect.objectContaining({
        kind: 'withdraw',
        title: 'Sent ETH',
        amountLabel: '−$750.00',
        amountTone: 'negative',
        category: 'eth',
        tokenSymbol: 'ETH',
      }),
    );
  });

  it('maps mixed directions to a cross-category rebalance story', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'send',
            value_formatted: '100',
          }),
          typedTransfer({
            token_address: CBBTC_ARB,
            token_symbol: 'cbBTC',
            direction: 'receive',
            value_formatted: '0.001',
          }),
        ],
      }),
    );

    expect(event).toEqual(
      expect.objectContaining({
        kind: 'rebalance',
        title: 'Stable → BTC',
      }),
    );
  });

  it('prefers a trimmed Moralis summary over the composed title', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        summary: '  Executed portfolio instruction  ',
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '50',
          }),
        ],
      }),
    );

    expect(event?.title).toBe('Executed portfolio instruction');
  });

  it('uses the composed title when the Moralis summary is whitespace-only', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        summary: '   ',
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '50',
          }),
        ],
      }),
    );

    expect(event?.title).toBe('Received USDC');
  });

  it('adds protocol, decoded method, tx hash, and gas metadata for the activity card', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        hash: '0xactivity',
        method_label: 'deposit',
        to_address_entity: 'Aave V3',
        transaction_fee: '0.00002341',
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'send',
            value_formatted: '50',
          }),
        ],
      }),
    );

    expect(event).toEqual(
      expect.objectContaining({
        txHash: '0xactivity',
        methodLabel: 'deposit',
        protocol: 'Aave',
        gasFeeLabel: '0.000023 ETH',
      }),
    );
  });

  it('keeps an unknown Moralis entity as the protocol placeholder label', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        to_address_entity: 'Example Router',
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'send',
            value_formatted: '10',
          }),
        ],
      }),
    );

    expect(event?.protocol).toBe('Example Router');
  });

  it('keeps decoded contract interactions even when no supported token moves', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        summary: 'Approve USDC for Aave',
        method_label: 'approve',
        to_address_entity: 'Aave V3',
        transaction_fee: '0.0002',
      }),
    );

    expect(event).toEqual(
      expect.objectContaining({
        kind: 'contract-interaction',
        title: 'Approve USDC for Aave',
        protocol: 'Aave',
        txHash: '0xhash',
        gasFeeLabel: '0.0002 ETH',
      }),
    );
  });

  it('drops spam metadata-only interactions but retains supported transfers', () => {
    const spamMetadataOnly = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        method_label: 'transfer',
        to_address_entity: 'Claim Reward',
        possible_spam: true,
      }),
    );
    const spamWithSupportedTransfer = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        possible_spam: 'true',
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '5',
          }),
        ],
      }),
    );

    expect(spamMetadataOnly).toBeNull();
    expect(spamWithSupportedTransfer?.kind).toBe('deposit');
  });

  it('shows gas only when the sender is owned or sender ownership is unknown', () => {
    const ownAddresses = new Set([
      '0x1111111111111111111111111111111111111111',
    ]);
    const ownSend = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        from_address: '0x1111111111111111111111111111111111111111',
        method_label: 'approve',
        transaction_fee: '0.000012',
      }),
      { ownAddresses },
    );
    const incoming = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        from_address: '0x2222222222222222222222222222222222222222',
        method_label: 'transfer',
        transaction_fee: '0.000012',
      }),
      { ownAddresses },
    );
    const unknownOwnership = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        from_address: '0x2222222222222222222222222222222222222222',
        method_label: 'transfer',
        transaction_fee: '0.000012',
      }),
    );

    expect(ownSend?.gasFeeLabel).toBe('0.000012 ETH');
    expect(incoming).not.toHaveProperty('gasFeeLabel');
    expect(unknownOwnership?.gasFeeLabel).toBe('0.000012 ETH');
  });

  it.each([
    [0, undefined],
    ['0.0000009', '< 0.000001 ETH'],
    ['0.000001', '0.000001 ETH'],
  ])('formats gas fee %j as %j', (transaction_fee, expected) => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({ method_label: 'approve', transaction_fee }),
    );

    expect(event?.gasFeeLabel).toBe(expected);
  });

  it('uses the largest priced category for the row category and amount', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'send',
            value_formatted: '100',
            value_usd: '100',
          }),
          typedTransfer({
            token_address: CBBTC_ARB,
            token_symbol: 'cbBTC',
            direction: 'receive',
            value_formatted: '0.0012',
            value_usd: '120',
          }),
        ],
      }),
    );

    expect(event).toEqual(
      expect.objectContaining({
        category: 'btc',
        tokenSymbol: 'CBBTC',
        amountLabel: '+$120.00',
        amountTone: 'positive',
      }),
    );
    expect(event?.categoryDeltas?.map((delta) => delta.category)).toEqual([
      'btc',
      'stable',
    ]);
  });

  it('prefers a priced category over a larger unpriced token amount', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'send',
            value_formatted: '10',
            value_usd: '10',
          }),
        ],
        native_transfers: [
          typedTransfer({
            direction: 'receive',
            value_formatted: '100',
          }),
        ],
      }),
    );

    expect(event).toEqual(
      expect.objectContaining({
        category: 'stable',
        tokenSymbol: 'USDC',
        amountLabel: '−$10.00',
        amountTone: 'negative',
      }),
    );
  });

  it('omits the USD amount presentation when every supported leg is unpriced', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '25',
          }),
        ],
      }),
    );

    expect(event).not.toHaveProperty('amountLabel');
    expect(event).not.toHaveProperty('amountTone');
    expect(event?.category).toBe('stable');
  });

  it('classifies cbBTC as BTC and exposes the normalized symbol', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        erc20_transfers: [
          typedTransfer({
            token_address: CBBTC_ARB,
            token_symbol: 'cbBTC',
            direction: 'receive',
            value_formatted: '0.5',
          }),
        ],
      }),
    );

    expect(event).toEqual(
      expect.objectContaining({ category: 'btc', tokenSymbol: 'CBBTC' }),
    );
  });

  it.each(['0', 0, false])(
    'retains an explicitly failed event for receipt status %j',
    (receipt_status) => {
      const event = mapMoralisEvent(
        ARBITRUM,
        historyEvent({
          receipt_status,
          erc20_transfers: [
            typedTransfer({
              token_address: USDC_ARB,
              token_symbol: 'USDC',
              direction: 'send',
              value_formatted: '10',
            }),
          ],
        }),
      );

      expect(event).not.toBeNull();
      expect(event?.status).toBe('Failed');
    },
  );

  it('drops an event after every transfer fails canonical validation', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        erc20_transfers: [
          runtimeAddressTransfer({
            address: SPOOF_ADDRESS,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '7221',
          }),
        ],
      }),
    );

    expect(event).toBeNull();
  });

  it('normalizes an invalid timestamp to zero', () => {
    const event = mapMoralisEvent(
      ARBITRUM,
      historyEvent({
        block_timestamp: 'not-a-date',
        erc20_transfers: [
          typedTransfer({
            token_address: USDC_ARB,
            token_symbol: 'USDC',
            direction: 'receive',
            value_formatted: '1',
          }),
        ],
      }),
    );

    expect(event?.timestamp).toBe(0);
  });
});

describe('summarizeCategoryFlows', () => {
  it('nets USD by category and weights shares by event-category touches', () => {
    const summary = summarizeCategoryFlows([
      mappedEvent({
        hash: '0xa',
        symbolDeltas: [{ symbol: 'USDC', amount: 50, usd: 50 }],
      }),
      mappedEvent({
        hash: '0xb',
        symbolDeltas: [
          { symbol: 'USDC', amount: -10, usd: -10 },
          { symbol: 'CBBTC', amount: 0.001, usd: 100 },
        ],
      }),
      mappedEvent({
        hash: '0xc',
        symbolDeltas: [{ symbol: 'ETH', amount: -0.01, usd: -30 }],
      }),
    ]);

    expect(summary).toEqual([
      expect.objectContaining({ category: 'btc', usdNet: 100, share: 0.25 }),
      expect.objectContaining({
        category: 'stable',
        usdNet: 40,
        share: 0.5,
      }),
      expect.objectContaining({ category: 'eth', usdNet: -30, share: 0.25 }),
    ]);
  });

  it('keeps a zero-net category in the active summary', () => {
    const summary = summarizeCategoryFlows([
      mappedEvent({
        hash: '0xa',
        symbolDeltas: [{ symbol: 'USDC', amount: 50, usd: 50 }],
      }),
      mappedEvent({
        hash: '0xb',
        symbolDeltas: [{ symbol: 'USDC', amount: -50, usd: -50 }],
      }),
    ]);

    expect(summary).toEqual([
      {
        category: 'stable',
        usdNet: 0,
        label: '+0 USDC',
        share: 1,
      },
    ]);
  });

  it('counts a category at most once per event when computing shares', () => {
    const summary = summarizeCategoryFlows([
      mappedEvent({
        hash: '0xa',
        symbolDeltas: [
          { symbol: 'USDC', amount: 10, usd: 10 },
          { symbol: 'USDT', amount: 5, usd: 5 },
        ],
      }),
      mappedEvent({
        hash: '0xb',
        symbolDeltas: [{ symbol: 'ETH', amount: 1, usd: 3000 }],
      }),
    ]);

    expect(summary.find((flow) => flow.category === 'stable')?.share).toBe(0.5);
    expect(summary.find((flow) => flow.category === 'eth')?.share).toBe(0.5);
  });

  it('returns an empty summary for an empty feed', () => {
    expect(summarizeCategoryFlows([])).toEqual([]);
  });
});

describe('ACTIVITY_FILTERS', () => {
  it('exposes All followed by every allocation category key', () => {
    expect(ACTIVITY_FILTERS).toEqual([
      'All',
      'btc',
      'eth',
      'spy',
      'stable',
      'alt',
    ]);
  });
});

describe('activityEventMatchesFilter', () => {
  const categoryDeltas: ActivityCategoryDelta[] = [
    { category: 'stable', usdNet: -100, label: '−100 USDC' },
    { category: 'btc', usdNet: 100, label: '+0.001 CBBTC' },
  ];
  const event = mappedEvent({ hash: '0xfilter', categoryDeltas });

  it.each(['All', 'stable', 'btc'] as const)(
    'matches the %s filter',
    (filter) => {
      expect(activityEventMatchesFilter(event, filter)).toBe(true);
    },
  );

  it.each(['eth', 'spy', 'alt'] as const)(
    'does not match the absent %s category',
    (filter) => {
      expect(activityEventMatchesFilter(event, filter)).toBe(false);
    },
  );

  it('does not fall back to the dominant category when deltas are absent', () => {
    const eventWithoutDeltas = mappedEvent({
      hash: '0xwithout-deltas',
      category: 'stable',
      categoryDeltas: [],
    });

    expect(activityEventMatchesFilter(eventWithoutDeltas, 'stable')).toBe(
      false,
    );
  });
});

describe('filterActivityGroups', () => {
  const groups: ActivityGroup[] = [
    {
      label: 'Today',
      events: [
        mappedEvent({
          hash: '0xstable',
          categoryDeltas: [
            { category: 'stable', usdNet: 50, label: '+50 USDC' },
          ],
        }),
      ],
    },
    {
      label: 'Earlier',
      events: [
        mappedEvent({
          hash: '0xbtc',
          categoryDeltas: [
            { category: 'btc', usdNet: 100, label: '+0.001 CBBTC' },
          ],
        }),
      ],
    },
  ];

  it('returns a shallow copy of every group for All', () => {
    const result = filterActivityGroups(groups, 'All');

    expect(result).toEqual(groups);
    expect(result).not.toBe(groups);
    expect(result[0]).toBe(groups[0]);
  });

  it('filters events by lowercase category key and removes empty groups', () => {
    const result = filterActivityGroups(groups, 'btc');

    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe('Earlier');
    expect(result[0]?.events.map((event) => event.id)).toEqual([
      'arbitrum-0xbtc',
    ]);
  });

  it('returns no groups when no event touches the selected category', () => {
    expect(filterActivityGroups(groups, 'spy')).toEqual([]);
  });
});
