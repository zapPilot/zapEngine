import { describe, expect, it } from 'vitest';

import {
  ARBITRUM_DEPOSIT_TOKENS,
  DEFAULT_ARBITRUM_FUNDING_TOKEN,
  DEFAULT_BASE_FUNDING_TOKEN,
} from '@/integration/depositTokens';
import {
  buildInvestDepositPlanPreviewKey,
  buildInvestDepositPlanRequest,
} from '@/integration/useInvest';

const USER_ADDRESS = '0x0000000000000000000000000000000000000001';

describe('Invest deposit plan requests', () => {
  it('keeps the existing two-chain strategy request', () => {
    const request = buildInvestDepositPlanRequest({
      userAddress: USER_ADDRESS,
      scope: 'both',
      totalUsd6: '10000000',
      baseFundingToken: DEFAULT_BASE_FUNDING_TOKEN,
      arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
      singleChainFundingDraft: null,
    });

    expect(request).toMatchObject({
      kind: 'strategy',
      totalUsd6: '10000000',
      fundingSources: [
        {
          chainId: 8453,
          fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
        },
        {
          chainId: 42161,
          fromToken: DEFAULT_ARBITRUM_FUNDING_TOKEN.depositAddress,
        },
      ],
    });
  });

  it('builds the Base request from the frozen exact amount and explicit split', () => {
    const request = buildInvestDepositPlanRequest({
      userAddress: USER_ADDRESS,
      scope: 'base',
      totalUsd6: '10000',
      baseFundingToken: DEFAULT_BASE_FUNDING_TOKEN,
      arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
      singleChainFundingDraft: {
        scope: 'base',
        chainId: 8453,
        fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
        fromAmount: '10000',
      },
    });

    expect(request).toEqual({
      kind: 'invest',
      userAddress: USER_ADDRESS,
      sourceChainId: 8453,
      fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
      fromAmount: '10000',
      split: { '8453': 1 },
    });
  });

  it('pins HLP deposits to HyperCore while keeping Base as the source chain', () => {
    const request = buildInvestDepositPlanRequest({
      userAddress: USER_ADDRESS,
      scope: 'base',
      destination: 'hlp',
      totalUsd6: '12000000',
      baseFundingToken: DEFAULT_BASE_FUNDING_TOKEN,
      arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
      singleChainFundingDraft: {
        scope: 'base',
        chainId: 8453,
        fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
        fromAmount: '12000000',
      },
    });

    expect(request).toEqual({
      kind: 'invest',
      userAddress: USER_ADDRESS,
      sourceChainId: 8453,
      fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
      fromAmount: '12000000',
      split: { '1337': 1 },
    });
  });

  it('preserves the selected Arbitrum token for the four-pool GMX basket', () => {
    const selectedToken = ARBITRUM_DEPOSIT_TOKENS[1];
    const request = buildInvestDepositPlanRequest({
      userAddress: USER_ADDRESS,
      scope: 'arbitrum',
      totalUsd6: '10000000',
      baseFundingToken: DEFAULT_BASE_FUNDING_TOKEN,
      arbitrumFundingToken: selectedToken,
      singleChainFundingDraft: {
        scope: 'arbitrum',
        chainId: 42161,
        fromToken: selectedToken.depositAddress,
        fromAmount: '10000000',
      },
    });

    expect(request).toEqual({
      kind: 'gmx-v2-basket',
      userAddress: USER_ADDRESS,
      fromToken: selectedToken.depositAddress,
      amount: '10000000',
    });
  });

  it('does not reuse a frozen draft after the scope changes', () => {
    expect(
      buildInvestDepositPlanRequest({
        userAddress: USER_ADDRESS,
        scope: 'arbitrum',
        totalUsd6: '10000000',
        baseFundingToken: DEFAULT_BASE_FUNDING_TOKEN,
        arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
        singleChainFundingDraft: {
          scope: 'base',
          chainId: 8453,
          fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
          fromAmount: '10000000',
        },
      }),
    ).toBeNull();
  });

  it.each(['base', 'arbitrum'] as const)(
    'does not build a %s request before the exact funding draft is frozen',
    (scope) => {
      expect(
        buildInvestDepositPlanRequest({
          userAddress: USER_ADDRESS,
          scope,
          totalUsd6: '10000000',
          baseFundingToken: DEFAULT_BASE_FUNDING_TOKEN,
          arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
          singleChainFundingDraft: null,
        }),
      ).toBeNull();
    },
  );

  it('partitions preview cache keys by scope, token, split, basket kind, and exact amount', () => {
    const baseRequest = buildInvestDepositPlanRequest({
      userAddress: USER_ADDRESS,
      scope: 'base',
      totalUsd6: '10000000',
      baseFundingToken: DEFAULT_BASE_FUNDING_TOKEN,
      arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
      singleChainFundingDraft: {
        scope: 'base',
        chainId: 8453,
        fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
        fromAmount: '9999999',
      },
    });
    const hlpRequest = buildInvestDepositPlanRequest({
      userAddress: USER_ADDRESS,
      scope: 'base',
      destination: 'hlp',
      totalUsd6: '9999999',
      baseFundingToken: DEFAULT_BASE_FUNDING_TOKEN,
      arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
      singleChainFundingDraft: {
        scope: 'base',
        chainId: 8453,
        fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
        fromAmount: '9999999',
      },
    });
    const arbitrumRequest = buildInvestDepositPlanRequest({
      userAddress: USER_ADDRESS,
      scope: 'arbitrum',
      totalUsd6: '10000000',
      baseFundingToken: DEFAULT_BASE_FUNDING_TOKEN,
      arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
      singleChainFundingDraft: {
        scope: 'arbitrum',
        chainId: 42161,
        fromToken: DEFAULT_ARBITRUM_FUNDING_TOKEN.depositAddress,
        fromAmount: '10000000',
      },
    });

    const baseKey = buildInvestDepositPlanPreviewKey('base', baseRequest);
    const hlpKey = buildInvestDepositPlanPreviewKey('base', hlpRequest);
    const arbitrumKey = buildInvestDepositPlanPreviewKey(
      'arbitrum',
      arbitrumRequest,
    );

    expect(baseKey).toContain(DEFAULT_BASE_FUNDING_TOKEN.depositAddress);
    expect(baseKey).toContain('9999999');
    expect(arbitrumKey).toContain(
      DEFAULT_ARBITRUM_FUNDING_TOKEN.depositAddress,
    );
    expect(arbitrumKey).toContain('10000000');
    expect(arbitrumKey).toContain('gmx-v2-basket');
    expect(baseKey).not.toEqual(hlpKey);
    expect(baseKey).not.toEqual(arbitrumKey);
  });
});
