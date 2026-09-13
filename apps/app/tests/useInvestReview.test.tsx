// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ARBITRUM_DEPOSIT_TOKENS,
  BASE_DEPOSIT_TOKENS,
} from '@/integration/depositTokens';
import type { StageDraft } from '@/integration/investTargetsModel';
import {
  useInvestReview,
  type UseInvestReviewResult,
} from '@/integration/useInvestReview';

const mocks = vi.hoisted(() => ({
  getDepositReview: vi.fn(),
  account: { address: null as string | null },
  invest: { stageDrafts: [] as StageDraft[] },
}));

vi.mock('@zapengine/app-core/services', () => ({
  getDepositReview: mocks.getDepositReview,
}));

vi.mock('@zapengine/app-core/lib/http', () => ({
  handleHTTPError: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

vi.mock('@/integration/useAccount', () => ({
  useAccount: () => mocks.account,
}));

vi.mock('@/integration/useInvest', () => ({
  useInvest: () => mocks.invest,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const WALLET = '0x1111111111111111111111111111111111111111';

const morphoDraft: StageDraft = {
  positionId: 'morpho-base',
  weightBps: 6_000,
  usd6: '60000000',
  sourceToken: BASE_DEPOSIT_TOKENS[0],
  fromAmount: '60000000',
};

const hlpDraft: StageDraft = {
  positionId: 'hlp',
  ingress: 'bridge2',
  weightBps: 4_000,
  usd6: '40000000',
  sourceToken: ARBITRUM_DEPOSIT_TOKENS[0],
  fromAmount: '40000000',
};

function reviewResponse(sourceChainId: number) {
  return {
    plan: {
      legs: [],
      approvals: [],
      calls: [],
      totalGasUsd: '0',
      sourceChainId,
    },
    planFingerprint: `0x${'11'.repeat(32)}`,
    reviewedAt: 1,
    expiresAt: 2,
    reviews: {
      [`chain-${sourceChainId}`]: { groupId: `chain-${sourceChainId}` },
    },
  };
}

interface Harness {
  root: Root;
  container: HTMLDivElement;
  client: QueryClient;
  current(): UseInvestReviewResult;
}

let active: Harness | null = null;

function Probe({
  onValue,
}: {
  onValue: (value: UseInvestReviewResult) => void;
}) {
  onValue(useInvestReview());
  return null;
}

async function render(): Promise<Harness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let value: UseInvestReviewResult | null = null;

  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(Probe, { onValue: (next) => (value = next) }),
      ),
    );
    await Promise.resolve();
  });
  // React Query notifies through its scheduler, so settle on macrotasks.
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const settled = value as UseInvestReviewResult | null;
    if (settled && !settled.isLoading) break;
  }

  const harness: Harness = {
    root,
    container,
    client,
    current: () => {
      if (!value) throw new Error('useInvestReview did not render');
      return value;
    },
  };
  active = harness;
  return harness;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.address = WALLET;
  mocks.invest.stageDrafts = [];
  mocks.getDepositReview.mockImplementation(
    async (request: { sourceChainId?: number }) =>
      reviewResponse(request.sourceChainId ?? 42161),
  );
});

afterEach(async () => {
  if (!active) return;
  await act(async () => {
    active?.root.unmount();
  });
  active.container.remove();
  active.client.clear();
  active = null;
});

describe('useInvestReview', () => {
  it('stays disabled with no frozen stages', async () => {
    const harness = await render();
    expect(mocks.getDepositReview).not.toHaveBeenCalled();
    expect(harness.current().isLoading).toBe(false);
    expect(harness.current().hasAllStages).toBe(false);
  });

  it('stays disabled without a connected wallet', async () => {
    mocks.account.address = null;
    mocks.invest.stageDrafts = [morphoDraft];
    await render();
    expect(mocks.getDepositReview).not.toHaveBeenCalled();
  });

  it('reviews each frozen stage with its own request', async () => {
    mocks.invest.stageDrafts = [morphoDraft, hlpDraft];
    const harness = await render();

    expect(mocks.getDepositReview).toHaveBeenCalledTimes(2);
    expect(mocks.getDepositReview.mock.calls[0]?.[0]).toEqual({
      kind: 'invest',
      userAddress: WALLET,
      fromToken: BASE_DEPOSIT_TOKENS[0].depositAddress,
      fromAmount: '60000000',
      sourceChainId: 8453,
      split: { '8453': 1 },
    });
    expect(mocks.getDepositReview.mock.calls[1]?.[0]).toEqual({
      kind: 'invest',
      userAddress: WALLET,
      fromToken: ARBITRUM_DEPOSIT_TOKENS[0].depositAddress,
      fromAmount: '40000000',
      sourceChainId: 42161,
      split: { '1337': 1 },
    });
    expect(harness.current().hasAllStages).toBe(true);
    expect(
      harness.current().stages.map((stage) => stage.review.groupId),
    ).toEqual(['chain-8453', 'chain-42161']);
  });

  it('fails loudly when the expected group is missing', async () => {
    mocks.invest.stageDrafts = [morphoDraft];
    mocks.getDepositReview.mockResolvedValue({
      ...reviewResponse(8453),
      reviews: {},
    });
    const harness = await render();

    expect(harness.current().isError).toBe(true);
    expect(harness.current().errorMessage).toContain('morpho-base');
  });

  it('re-reviews only the requested stage at a checkpoint', async () => {
    mocks.invest.stageDrafts = [morphoDraft, hlpDraft];
    const harness = await render();
    mocks.getDepositReview.mockClear();

    const fresh = await harness.current().reviewStage(1);

    expect(mocks.getDepositReview).toHaveBeenCalledTimes(1);
    expect(mocks.getDepositReview.mock.calls[0]?.[0]).toMatchObject({
      sourceChainId: 42161,
    });
    expect(fresh.draft).toBe(hlpDraft);
  });
});
