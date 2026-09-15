// @vitest-environment jsdom
import { renderInvestUi } from './support/investUiHarness';
import { expect, it, vi } from 'vitest';

import { BASE_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import { InvestRouteScreen } from '@/screens/invest/InvestRouteScreen';

const { legPlan } = vi.hoisted(() => ({
  legPlan: {
    plan: { lockupDays: 4, step: { signing: null } },
    requestedUsd6: 57_000_000n,
    spendableUsd6: 60_000_000n,
    accountMode: 'unified',
    shortfallUsd6: 0n,
    isLoading: false,
    isError: false,
    isReady: true,
  },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  Redirect: () => null,
}));
vi.mock('@/integration/useAccount', () => ({
  useAccount: () => ({
    address: '0x1111111111111111111111111111111111111111',
    isConnected: true,
    isConnecting: false,
  }),
}));
vi.mock('@/integration/useInvest', () => ({
  useInvest: () => ({
    amountUsd: 100,
    stageDrafts: [
      {
        positionId: 'morpho-base',
        weightBps: 300,
        usd6: '3000000',
        sourceToken: BASE_DEPOSIT_TOKENS[0],
        fromAmount: '3000000',
      },
    ],
    hyperCoreFundingDraft: {
      source: 'hypercore-spot',
      requestedUsd6: '57000000',
      weightBps: 5700,
    },
  }),
}));
vi.mock('@/integration/useInvestReview', () => ({
  useInvestReview: () => ({
    batches: [],
    hasAllBatches: true,
    isLoading: false,
    isError: false,
    errorMessage: null,
    retry: vi.fn(),
  }),
}));
vi.mock('@/integration/useInvestExecution', () => ({
  useInvestExecution: () => ({ capability: 'ready' }),
}));
vi.mock('@/screens/invest/useHyperCoreLegPlan', () => ({
  useHyperCoreLegPlan: () => legPlan,
}));
vi.mock('@/hooks/useHyperliquidAgent', () => ({
  useHyperliquidAgent: () => ({
    status: 'idle',
    isReady: false,
    error: null,
    approve: vi.fn(),
  }),
}));
vi.mock('@/screens/invest/useInvestRouteSubmit', () => ({
  useInvestRouteSubmit: () => ({
    handleConfirm: vi.fn(),
    ctaLabel: 'Confirm & send',
    ctaDisabled: false,
    reviewBlocked: false,
    reviewExecutionLocked: false,
    submissionError: null,
    dismissSubmissionError: vi.fn(),
  }),
}));
vi.mock('@/components/invest/ChainBatchReviewCard', () => ({
  ChainBatchReviewCard: () => null,
}));
// Chrome this screen renders around the cards; both reach native-only modules
// (react-native-svg, nativewind) the DOM harness does not provide.
vi.mock('@/components/ui/NonCustodialCard', () => ({
  NonCustodialCard: () => null,
}));
vi.mock('@/components/ui/Skeleton', () => ({ SkeletonBlock: () => null }));

it('counts the HyperCore leg into the total and never implies it was simulated', async () => {
  const container = await renderInvestUi(<InvestRouteScreen />);
  // $3 of stages plus the $57 leg: omitting the leg would under-report the
  // whole HLP allocation.
  expect(container.textContent).toContain('$60.00');
  expect(container.textContent).toContain('Hyperliquid · HLP');
  expect(container.textContent).toContain(
    'Not simulated — this is a Hyperliquid exchange action, not an EVM transaction.',
  );
  expect(container.textContent).toContain('Withdrawal lock');
  expect(container.textContent).toContain('4 days after deposit');
  // One wallet batch plus one agent-signed action.
  expect(container.textContent).toContain('Step 2 of 2');
  expect(container.textContent).toContain(
    'The HLP deposit needs no wallet transaction',
  );
  expect(container.textContent).toContain(
    'straight from the USDC already on Hyperliquid',
  );
});
