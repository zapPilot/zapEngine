// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { APIError } from '@zapengine/app-core/lib/http';
import {
  GMX_DEPOSIT_TOO_SMALL_ERROR_CODE,
  HLP_DEPOSIT_TOO_SMALL_ERROR_CODE,
} from '@zapengine/types/api';
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

vi.mock('@zapengine/app-core/services/planOrchestrationService', () => ({
  getDepositReview: mocks.getDepositReview,
}));

vi.mock('@zapengine/app-core/lib/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@zapengine/app-core/lib/http')>()),
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

const gmxDraft: StageDraft = {
  positionId: 'gmx-arbitrum',
  weightBps: 3_500,
  usd6: '35000000',
  sourceToken: ARBITRUM_DEPOSIT_TOKENS[0],
  fromAmount: '35000000',
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

async function render(
  queries: { retry?: number | false; retryDelay?: number } = {},
): Promise<Harness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, ...queries } },
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
    expect(harness.current().hasAllBatches).toBe(false);
  });

  it('stays disabled without a connected wallet', async () => {
    mocks.account.address = null;
    mocks.invest.stageDrafts = [morphoDraft];
    await render();
    expect(mocks.getDepositReview).not.toHaveBeenCalled();
  });

  it('sends one request per source chain, not per position', async () => {
    mocks.invest.stageDrafts = [morphoDraft, gmxDraft, hlpDraft];
    const harness = await render();

    expect(mocks.getDepositReview).toHaveBeenCalledTimes(2);
    expect(mocks.getDepositReview.mock.calls[0]?.[0]).toEqual({
      kind: 'chain-batch',
      userAddress: WALLET,
      sourceChainId: 8453,
      positions: [
        {
          kind: 'invest',
          fromToken: BASE_DEPOSIT_TOKENS[0].depositAddress,
          fromAmount: '60000000',
          split: { '8453': 1 },
        },
      ],
    });
    expect(mocks.getDepositReview.mock.calls[1]?.[0]).toEqual({
      kind: 'chain-batch',
      userAddress: WALLET,
      sourceChainId: 42161,
      positions: [
        {
          kind: 'gmx-v2-basket',
          fromToken: ARBITRUM_DEPOSIT_TOKENS[0].depositAddress,
          amount: '35000000',
        },
        {
          kind: 'invest',
          fromToken: ARBITRUM_DEPOSIT_TOKENS[0].depositAddress,
          fromAmount: '40000000',
          split: { '1337': 1 },
        },
      ],
    });
    expect(harness.current().hasAllBatches).toBe(true);
    expect(
      harness.current().batches.map((batch) => batch.review.groupId),
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
    expect(harness.current().errorMessage).toContain('chain 8453');
  });

  // A client that would retry, with a delay long enough that no retry fires
  // during the test: what is observed is the first failure alone.
  const retryingClient = { retry: 2, retryDelay: 60_000 };

  it('explains a GMX leg refused as too small, without retrying it', async () => {
    mocks.invest.stageDrafts = [gmxDraft];
    mocks.getDepositReview.mockRejectedValue(
      new APIError(
        'GMX v2 btc-btc deposit too small: swap output has no slippage buffer',
        422,
        GMX_DEPOSIT_TOO_SMALL_ERROR_CODE,
      ),
    );
    const harness = await render(retryingClient);

    expect(mocks.getDepositReview).toHaveBeenCalledOnce();
    expect(harness.current().isError).toBe(true);
    expect(harness.current().amountTooSmall?.title).toBe(
      'Crypto share too small',
    );
    expect(harness.current().errorMessage).toContain(
      'Crypto share is too small for GMX',
    );
  });

  it('explains an HLP share the bridge lands under the vault minimum, without retrying it', async () => {
    mocks.invest.stageDrafts = [
      {
        ...hlpDraft,
        ingress: 'lifi',
        sourceToken: BASE_DEPOSIT_TOKENS[0],
        usd6: '10003500',
        fromAmount: '10003500',
      },
    ];
    mocks.getDepositReview.mockRejectedValue(
      new APIError(
        'HLP allocation is below the vault minimum of 10000000 perp USDC base units (quoted 9978491)',
        422,
        HLP_DEPOSIT_TOO_SMALL_ERROR_CODE,
      ),
    );
    const harness = await render(retryingClient);

    expect(mocks.getDepositReview).toHaveBeenCalledOnce();
    expect(harness.current().isError).toBe(true);
    expect(harness.current().amountTooSmall).toEqual({
      title: 'HLP share too small',
      message:
        'After bridge fees your HLP share would reach Hyperliquid below its $10.00 minimum. Increase the amount or the Stable percentage.',
    });
    expect(harness.current().errorMessage).toBe(
      harness.current().amountTooSmall?.message,
    );
  });

  it("keeps the client's retry policy for every other failure", async () => {
    mocks.invest.stageDrafts = [gmxDraft];
    mocks.getDepositReview.mockRejectedValue(
      new APIError('Plan simulation unavailable: timeout', 503),
    );
    const harness = await render(retryingClient);

    // Still waiting on its first retry rather than failed outright.
    expect(mocks.getDepositReview).toHaveBeenCalledOnce();
    expect(harness.current().isError).toBe(false);
    expect(harness.current().amountTooSmall).toBeNull();
  });

  it('supports explicit retry and refresh of all reviewed batches', async () => {
    mocks.invest.stageDrafts = [morphoDraft];
    const harness = await render();
    mocks.getDepositReview.mockClear();

    harness.current().retry();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.getDepositReview).toHaveBeenCalledOnce();

    mocks.getDepositReview.mockClear();
    await expect(harness.current().refresh()).resolves.toHaveLength(1);
    expect(mocks.getDepositReview).toHaveBeenCalledOnce();
  });

  it('returns an empty refresh result when review cannot run without a wallet', async () => {
    mocks.account.address = null;
    mocks.invest.stageDrafts = [morphoDraft];
    const harness = await render();

    await expect(harness.current().refresh()).resolves.toEqual([]);
  });

  it('rejects a checkpoint index with no matching batch', async () => {
    mocks.invest.stageDrafts = [morphoDraft];
    const harness = await render();

    await expect(harness.current().reviewBatch(9)).rejects.toThrow(
      'next reviewed batch is unavailable',
    );
  });

  it('rejects checkpoint review without a connected wallet', async () => {
    mocks.account.address = null;
    mocks.invest.stageDrafts = [morphoDraft];
    const harness = await render();

    await expect(harness.current().reviewBatch(0)).rejects.toThrow(
      'next reviewed batch is unavailable',
    );
  });

  it('re-reviews only the requested batch at a checkpoint', async () => {
    mocks.invest.stageDrafts = [morphoDraft, gmxDraft, hlpDraft];
    const harness = await render();
    mocks.getDepositReview.mockClear();

    const fresh = await harness.current().reviewBatch(1);

    expect(mocks.getDepositReview).toHaveBeenCalledTimes(1);
    expect(mocks.getDepositReview.mock.calls[0]?.[0]).toMatchObject({
      sourceChainId: 42161,
    });
    expect(fresh.draft.positions).toEqual([gmxDraft, hlpDraft]);
  });
});
