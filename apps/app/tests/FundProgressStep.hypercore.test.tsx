// @vitest-environment jsdom
import { clickUi, renderInvestUi } from './support/investUiHarness';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { FundProgressStep } from '@/components/fund/FundProgressStep';
import { useFundExecutionController } from '@/components/fund/useFundExecutionController';
function ProgressHarness() {
  const [visible, setVisible] = useState(true);
  const controller = useFundExecutionController({ visible });
  return (
    <>
      <button onClick={() => setVisible(false)}>Close fixture</button>
      <FundProgressStep controller={controller} />
    </>
  );
}

const { agentSigning, spotPlan, wizard, invest, execution } = vi.hoisted(() => {
  const signing = {
    scheme: 'hyperliquid-l1-action' as const,
    hyperliquidChain: 'Mainnet' as const,
    apiUrl: 'https://api.hyperliquid.xyz',
  };
  return {
    agentSigning: { calls: [] as unknown[] },
    spotPlan: {
      kind: 'hlp-spot-deposit',
      execution: 'hypercore-signatures',
      amountUsd6: '57000000',
      minDepositUsd: '10000000',
      lockupDays: 4,
      step: {
        kind: 'hyperliquid-vault-deposit',
        chainId: 1337,
        amount: { source: 'fixed', amount: '57000000' },
        minDepositUsd: '10000000',
        action: {
          type: 'vaultTransfer',
          vaultAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
          isDeposit: true,
        },
        signing,
        lockupDays: 4,
      },
    },
    wizard: {
      state: {
        stage: 'hyperliquidDeposit',
        plan: null,
        legs: [],
        hlp: { status: 'arrived', arrivedUsd6: null, step: null },
        error: null,
      },
    },
    execution: {
      phase: 'complete' as 'complete' | 'confirming' | 'checkpoint',
      next: vi.fn(),
      reviewNext: vi.fn(),
    },
    invest: {
      value: {
        amountUsd: 100,
        stageDrafts: [],
        hyperCoreFundingDraft: {
          source: 'hypercore-spot',
          requestedUsd6: '57000000',
          weightBps: 5700,
        },
        hlpBaselineUsd6: null,
        setHlpBaselineUsd6: vi.fn(),
      },
    },
  };
});

vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ languageCode: 'en', t: en }) };
});
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
  useInvest: () => invest.value,
}));
vi.mock('@/integration/useInvestExecution', () => ({
  useInvestExecution: () => ({
    reviewedSubmission: { callsId: 'calls-1' },
    reviewedProgress: {
      phase: execution.phase,
      groupIndex: 0,
      groupCount: 1,
      callsId: 'calls-1',
      transactionHash: '0xabc',
      statusNote: null,
    },
    reviewedQueue:
      execution.phase === 'checkpoint'
        ? [queuedBatch, queuedBatch]
        : [{ plan: null, review: { groupId: 'g1', chainId: 8453 } }],
    updateReviewedQueueEntry: vi.fn(),
    submitNextReviewedBatch: execution.next,
    reset: vi.fn(),
  }),
}));
vi.mock('@/integration/useInvestReview', () => ({
  useInvestReview: () => ({ reviewBatch: execution.reviewNext }),
}));
vi.mock('@/components/fund/useHyperCoreLegPlan', () => ({
  useHyperCoreLegPlan: () => ({
    plan: spotPlan,
    requestedUsd6: 57000000n,
    spendableUsd6: 60000000n,
    accountMode: 'unified',
    shortfallUsd6: 0n,
    isLoading: false,
    isError: false,
    isReady: true,
  }),
}));
vi.mock('@/hooks/useHyperliquidAgent', () => ({
  useHyperliquidAgent: (signing: unknown) => {
    agentSigning.calls.push(signing);
    return {
      status: 'idle',
      isReady: false,
      error: null,
      approve: vi.fn(),
    };
  },
}));
// Only rendered at a checkpoint, which this run never reaches; its simulation
// subtree drags in native-only modules the DOM harness cannot load.
vi.mock('@/components/invest/ChainBatchReviewCard', () => ({
  ChainBatchReviewCard: () => null,
}));
vi.mock('@zapengine/app-core/hooks/useDepositWizard', () => ({
  useDepositWizard: () => ({
    wizard: wizard.state,
    resumeReviewedPlan: vi.fn(),
    startSpotDeposit: vi.fn(async () => undefined),
    runHlpDeposit: vi.fn(),
    retry: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ t: en }) };
});
beforeEach(() => {
  vi.clearAllMocks();
  agentSigning.calls.length = 0;
  execution.phase = 'complete';
  wizard.state.stage = 'hyperliquidDeposit';
  wizard.state.hlp = { status: 'arrived', arrivedUsd6: null, step: null };
});

it('arms the Hyperliquid agent from the HyperCore plan, not the reviewed queue', async () => {
  const container = await renderInvestUi(<ProgressHarness />);
  // The reviewed queue holds no HLP batch here, so an agent read from it would
  // stay null forever — silently, because an un-armed session reports no error.
  expect(agentSigning.calls.at(-1)).toEqual(spotPlan.step.signing);
  expect(container.textContent).toContain('Authorize Hyperliquid signing');
  // No bridge and no arrival to wait for: one row, not three.
  expect(container.textContent).toContain('Deposit into Hyperliquid');
  expect(container.textContent).not.toContain('Bridge to Hyperliquid');
  expect(container.textContent).not.toContain('Funding arrived');
});

it('holds the four-day lock until every wallet batch has landed', async () => {
  execution.phase = 'confirming';
  const container = await renderInvestUi(<ProgressHarness />);
  // Arming early would start a four-day withdrawal lock while a batch the user
  // is still signing for could yet fail.
  expect(container.textContent).not.toContain('Authorize Hyperliquid signing');
  expect(container.textContent).not.toContain('Funding submitted');
});

it('does not declare the route complete until the vault deposit lands', async () => {
  const pending = await renderInvestUi(<ProgressHarness />);
  expect(pending.textContent).not.toContain('Funding submitted');

  wizard.state.stage = 'done';
  wizard.state.hlp = { status: 'deposited', arrivedUsd6: null, step: null };
  const settled = await renderInvestUi(<ProgressHarness />);
  expect(settled.textContent).toContain('Funding submitted');
  expect(settled.textContent).toContain('Reviewed steps finished');
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

const queuedBatch = {
  plan: {
    sourceChainId: 8453,
    legs: [],
    approvals: [],
    calls: [],
    totalGasUsd: '0',
  },
  review: {
    groupId: 'chain-8453',
    chainId: 8453,
    status: 'passed',
    blocked: false,
    executionAllowed: true,
    expiresAt: 9_999_999_999_999,
  },
};
it('does not open the next wallet prompt when the sheet closes during re-review', async () => {
  execution.phase = 'checkpoint';
  let resolve!: (batch: typeof queuedBatch) => void;
  execution.reviewNext.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const container = await renderInvestUi(<ProgressHarness />);
  expect(execution.reviewNext).toHaveBeenCalledOnce();
  await clickUi(container, 'Close fixture');
  const { act } = await import('react');
  await act(async () => {
    resolve(queuedBatch);
    await Promise.resolve();
  });
  expect(execution.next).not.toHaveBeenCalled();
});
