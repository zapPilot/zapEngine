// @vitest-environment jsdom
import { renderInvestUi } from './support/investUiHarness';
import { beforeEach, expect, it, vi } from 'vitest';

import { InvestProgressScreen } from '@/screens/invest/InvestProgressScreen';

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
    execution: { phase: 'complete' as 'complete' | 'confirming' },
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
    reviewedQueue: [{ plan: null, review: { groupId: 'g1', chainId: 8453 } }],
    updateReviewedQueueEntry: vi.fn(),
    submitNextReviewedBatch: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock('@/integration/useInvestReview', () => ({
  useInvestReview: () => ({ reviewBatch: vi.fn() }),
}));
vi.mock('@/screens/invest/useHyperCoreLegPlan', () => ({
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
vi.mock('@/hooks/useCheckpointAutoAdvance', () => ({
  useCheckpointAutoAdvance: () => undefined,
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

beforeEach(() => {
  agentSigning.calls.length = 0;
  execution.phase = 'complete';
  wizard.state.stage = 'hyperliquidDeposit';
  wizard.state.hlp = { status: 'arrived', arrivedUsd6: null, step: null };
});

it('arms the Hyperliquid agent from the HyperCore plan, not the reviewed queue', async () => {
  const container = await renderInvestUi(<InvestProgressScreen />);
  // The reviewed queue holds no HLP batch here, so an agent read from it would
  // stay null forever — silently, because an un-armed session reports no error.
  expect(agentSigning.calls.at(-1)).toEqual(spotPlan.step.signing);
  expect(container.textContent).toContain(
    'Enable Hyperliquid signing and deposit',
  );
  // No bridge and no arrival to wait for: one row, not three.
  expect(container.textContent).toContain('Deposit into official HLP vault');
  expect(container.textContent).not.toContain('Bridge into Hyperliquid');
  expect(container.textContent).not.toContain('HyperCore USDC arrived');
});

it('holds the four-day lock until every wallet batch has landed', async () => {
  execution.phase = 'confirming';
  const container = await renderInvestUi(<InvestProgressScreen />);
  // Arming early would start a four-day withdrawal lock while a batch the user
  // is still signing for could yet fail.
  expect(container.textContent).not.toContain(
    'Enable Hyperliquid signing and deposit',
  );
  expect(container.textContent).not.toContain('Investment complete');
});

it('does not declare the route complete until the vault deposit lands', async () => {
  const pending = await renderInvestUi(<InvestProgressScreen />);
  expect(pending.textContent).not.toContain('Investment complete');

  wizard.state.stage = 'done';
  wizard.state.hlp = { status: 'deposited', arrivedUsd6: null, step: null };
  const settled = await renderInvestUi(<InvestProgressScreen />);
  expect(settled.textContent).toContain('Investment complete');
  expect(settled.textContent).toContain('HLP deposited');
});
