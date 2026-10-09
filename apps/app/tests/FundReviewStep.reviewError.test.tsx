// @vitest-environment jsdom
import { clickUi, renderInvestUi } from './support/investUiHarness';
import { beforeEach, expect, it, vi } from 'vitest';

import { ARBITRUM_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import { FundReviewStep } from '@/components/fund/FundReviewStep';

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  retry: vi.fn(),
  review: {
    amountTooSmall: null as { title: string; message: string } | null,
    errorMessage: '',
  },
}));

vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ languageCode: 'en', t: en }) };
});
vi.mock('expo-router', () => ({
  useRouter: () => ({ back: mocks.back, replace: vi.fn(), push: vi.fn() }),
  Redirect: () => null,
}));
vi.mock('@/integration/useInvest', () => ({
  useInvest: () => ({
    stageDrafts: [
      {
        positionId: 'gmx-arbitrum',
        weightBps: 100,
        usd6: '106400',
        sourceToken: ARBITRUM_DEPOSIT_TOKENS[0],
        fromAmount: '106400',
      },
    ],
    hyperCoreFundingDraft: null,
    setStageDrafts: mocks.back,
    setHyperCoreFundingDraft: vi.fn(),
    setHlpBaselineUsd6: vi.fn(),
  }),
}));
vi.mock('@/integration/useInvestReview', () => ({
  useInvestReview: () => ({
    batches: [],
    hasAllBatches: false,
    isLoading: false,
    isError: true,
    retry: mocks.retry,
    ...mocks.review,
  }),
}));
vi.mock('@/integration/useInvestExecution', () => ({
  useInvestExecution: () => ({ capability: 'ready', reset: vi.fn() }),
}));
vi.mock('@/components/fund/useHyperCoreLegPlan', () => ({
  useHyperCoreLegPlan: () => null,
}));
vi.mock('@/hooks/useHyperliquidAgent', () => ({
  useHyperliquidAgent: () => ({
    status: 'idle',
    isReady: false,
    error: null,
    approve: vi.fn(),
  }),
}));
vi.mock('@/components/fund/useFundSubmit', () => ({
  useFundSubmit: () => ({
    handleConfirm: vi.fn(),
    ctaLabel: 'Confirm & send',
    ctaDisabled: true,
    reviewBlocked: true,
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

vi.mock('@/components/ui/Skeleton', () => ({ SkeletonBlock: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
});

it.each([
  {
    title: 'Crypto share too small',
    message:
      'At this amount your Crypto share is too small for GMX: its BTC pool swap cannot keep a slippage buffer.',
  },
  {
    title: 'HLP share too small',
    message:
      'After bridge fees your HLP share would reach Hyperliquid below its $10.00 minimum.',
  },
])(
  'sends "$title" back to the amount step instead of retrying',
  async (tooSmall) => {
    mocks.review = { amountTooSmall: tooSmall, errorMessage: tooSmall.message };
    const container = await renderInvestUi(<FundReviewStep />);

    expect(container.textContent).toContain(tooSmall.title);
    expect(container.textContent).toContain(tooSmall.message);
    expect(container.textContent).not.toContain('Needs attention');
    expect(container.textContent).not.toContain('Re-check');

    await clickUi(container, 'Edit amount & mix');
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.retry).not.toHaveBeenCalled();
  },
);

it('keeps offering a retry for every other review failure', async () => {
  mocks.review = {
    amountTooSmall: null,
    errorMessage: 'Plan simulation unavailable: timeout',
  };
  const container = await renderInvestUi(<FundReviewStep />);

  expect(container.textContent).toContain('Needs attention');
  expect(container.textContent).toContain(
    'Plan simulation unavailable: timeout',
  );

  await clickUi(container, 'Re-check');
  expect(mocks.retry).toHaveBeenCalledOnce();
  expect(mocks.back).not.toHaveBeenCalled();
});

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <svg>{children}</svg>
  ),
  Circle: () => <circle />,
  Path: () => <path />,
  Rect: () => <rect />,
  Defs: ({ children }: { children?: React.ReactNode }) => (
    <defs>{children}</defs>
  ),
  ClipPath: ({ children }: { children?: React.ReactNode }) => (
    <clipPath>{children}</clipPath>
  ),
}));
