// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  FundFlowProvider,
  useFundFlow,
  useFundControllerState,
  type FundFlowValue,
} from '@/providers/FundFlowProvider';
import { useInvest, type InvestContextValue } from '@/integration/useInvest';
import { BASE_DEPOSIT_TOKENS } from '@/integration/depositTokens';
const mocks = vi.hoisted(() => ({
  account: {
    userId: 'owner-a' as string | null,
    address: '0x1111111111111111111111111111111111111111',
    isConnected: true,
    loadingUser: false,
  },
  progress: null as null | {
    phase: 'confirming' | 'checkpoint' | 'complete';
    groupIndex: number;
  },
  reset: vi.fn(),
  refresh: vi.fn().mockResolvedValue([]),
  review: vi.fn(),
}));
vi.mock('@/integration/useAccount', () => ({
  useAccount: () => mocks.account,
}));
vi.mock('@/integration/useInvestExecution', () => ({
  InvestExecutionProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useInvestExecution: () => ({
    reviewedProgress: mocks.progress,
    reviewedQueue: [],
    reset: mocks.reset,
  }),
}));
vi.mock('@/integration/useInvestReview', () => ({
  useInvestReview: (options: unknown) => {
    mocks.review(options);
    return {
      batches: [
        {
          review: {
            expiresAt: 1000,
            blocked: false,
            executionAllowed: true,
            status: 'passed',
          },
        },
      ],
      refresh: mocks.refresh,
    };
  },
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let value: {
  fund: FundFlowValue;
  invest: InvestContextValue;
  report: ReturnType<typeof useFundControllerState>['report'];
};
function Probe() {
  const fund = useFundFlow();
  const invest = useInvest();
  const { report } = useFundControllerState();
  useLayoutEffect(() => {
    value = { fund, invest, report };
  }, [fund, invest, report]);
  return null;
}
async function render() {
  await act(async () =>
    root.render(
      <FundFlowProvider>
        <Probe />
      </FundFlowProvider>,
    ),
  );
}
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mocks.account.userId = 'owner-a';
  mocks.account.isConnected = true;
  mocks.account.loadingUser = false;
  mocks.account.address = '0x1111111111111111111111111111111111111111';
  mocks.progress = null;
  mocks.reset.mockImplementation(() => {
    mocks.progress = null;
  });
  vi.spyOn(Date, 'now').mockReturnValue(2000);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('keeps a frozen review after closing, refreshes an expired review once, and preserves an execution on fresh open', async () => {
  await render();
  expect(mocks.review).toHaveBeenLastCalledWith({ autoReview: false });
  await act(async () => value.fund.open({ fresh: true }));
  expect(value.fund.visible).toBe(true);
  await act(async () => {
    value.invest.setAmountInput('100');
    value.invest.setStageDrafts([
      {
        positionId: 'morpho-base',
        weightBps: 10000,
        usd6: '100000000',
        fromAmount: '100000000',
        sourceToken: BASE_DEPOSIT_TOKENS[0],
      },
    ]);
  });
  expect(value.fund.step).toBe('review');
  await act(async () => value.fund.close());
  expect(value.fund.signRequest?.kind).toBe('review');
  mocks.refresh.mockClear();
  await act(async () => value.fund.open());
  expect(mocks.refresh).toHaveBeenCalledOnce();
  mocks.progress = { phase: 'confirming', groupIndex: 0 };
  await render();
  await act(async () => value.fund.close());
  mocks.reset.mockClear();
  await act(async () => value.fund.open({ fresh: true }));
  expect(mocks.reset).not.toHaveBeenCalled();
  expect(value.fund.step).toBe('progress');
});
it('resets the draft and closes on owner or signing wallet change', async () => {
  await render();
  await act(async () => {
    value.invest.setAmountInput('100');
    value.fund.open();
  });
  mocks.account.userId = 'owner-b';
  await render();
  expect(value.invest.amountInput).toBe('');
  expect(value.fund.visible).toBe(false);
  expect(mocks.reset).toHaveBeenCalled();
  await act(async () => value.fund.open());
  mocks.account.address = '0x2222222222222222222222222222222222222222';
  await render();
  expect(value.fund.visible).toBe(false);
  mocks.account.isConnected = false;
  mocks.account.userId = null;
  await render();
  await act(async () => value.fund.open());
  expect(value.fund.visible).toBe(false);
});
it('waits for the login user record before opening the authenticated funding goal', async () => {
  mocks.account.userId = null;
  mocks.account.loadingUser = true;
  await render();
  await act(async () => value.fund.open({ fresh: true }));
  expect(value.fund.visible).toBe(false);
  mocks.account.userId = 'owner-a';
  mocks.account.loadingUser = false;
  await render();
  expect(value.fund.visible).toBe(true);
});
it('offers agent authorization after the wallet batches finish and clears a completed flow on a fresh start', async () => {
  await render();
  await act(async () => value.invest.setAmountInput('100'));
  mocks.progress = { phase: 'complete', groupIndex: 0 };
  await render();
  await act(async () => value.report({ complete: false, needsAgent: true }));
  expect(value.fund.signRequest?.kind).toBe('agent');
  await act(async () => value.report({ complete: true, needsAgent: false }));
  expect(value.fund.signRequest).toBeNull();
  await act(async () => value.fund.open({ fresh: true }));
  expect(value.fund.step).toBe('amount');
  expect(value.invest.amountInput).toBe('');
});
