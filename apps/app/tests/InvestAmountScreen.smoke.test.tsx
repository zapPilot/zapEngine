// @vitest-environment jsdom
import {
  changeInput,
  clickUi,
  renderInvestUi,
} from './support/investUiHarness';
import { expect, it, vi } from 'vitest';
import { InvestAmountScreen } from '@/screens/invest/InvestAmountScreen';
import {
  InvestProvider,
  useInvest,
  type InvestContextValue,
} from '@/integration/useInvest';
import { planFunding } from '@/integration/investFundingPlanner';
const { push, rows } = vi.hoisted(() => ({
  push: vi.fn(),
  rows: [8453, 42161].map((chainId) => ({
    id: `${chainId}:USDC`,
    chain: chainId === 8453 ? ('base' as const) : ('arbitrum' as const),
    chainLabel: 'Chain',
    chainId,
    tokenAddress: null,
    decimals: 6,
    balance: '100',
    balanceBaseUnits: '100000000',
    usdValue: 100,
    usdPrice: 1,
    token: { symbol: 'USDC' as const, name: 'USD Coin' },
  })),
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
vi.mock('@/integration/useAccount', () => ({
  useAccount: () => ({
    address: '0x1111111111111111111111111111111111111111',
    isConnected: true,
    isConnecting: false,
  }),
}));
vi.mock('@/integration/walletTokens', () => ({
  useWalletAssets: () => ({
    chainRows: rows,
    failedChains: [],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('@/config/appCoreEnv', () => ({ isDevBuild: () => false }));
// A real balance, so this also proves the HyperCore leg is frozen alongside
// the EVM stages rather than left behind.
vi.mock('@/integration/useHlpBalances', () => ({
  useHyperCoreSpendable: () => ({
    balance: { spendableUsd6: 60_000_000n, mode: 'unified' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
it('freezes exactly the automatic plan shown by the default sector experience', async () => {
  let current: InvestContextValue | undefined;
  function Probe() {
    current = useInvest();
    return null;
  }
  const container = await renderInvestUi(
    <InvestProvider>
      <InvestAmountScreen />
      <Probe />
    </InvestProvider>,
  );
  expect(
    container.querySelectorAll('input[aria-label$="allocation percentage"]'),
  ).toHaveLength(2);
  expect(container.textContent).toContain('Crypto');
  expect(container.textContent).toContain('Stable');
  expect(container.textContent).toContain(
    'No executable S&P 500 position is live yet',
  );
  // The funding card answers "where does this come from" before the mix
  // editor asks "where does it go".
  const text = container.textContent!;
  expect(text).toContain("How we'll fund this");
  expect(text.indexOf("How we'll fund this")).toBeLessThan(
    text.indexOf('Your mix'),
  );
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  for (const forbidden of [
    'Select token',
    'Funding route',
    'Resolved after you enter an amount',
    'Deposit from your Hyperliquid balance instead',
  ])
    expect(container.textContent).not.toContain(forbidden);
  await changeInput(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Total investment in US dollars"]',
    )!,
    '100',
  );
  const expected = planFunding({
    demand: { totalUsd6: '100000000', allocations: current!.targetAllocations },
    supply: {
      rows,
      unavailableChainIds: [],
      hyperCoreSpendableUsd6: 60_000_000n,
    },
    constraints: { preferences: {}, gasReserveUsd: 5 },
  });
  await clickUi(container, 'Preview investment');
  expect(push).toHaveBeenCalledWith('/invest/route');
  expect(current!.stageDrafts).toEqual(expected.stages);
  expect(expected.hyperCoreLeg).not.toBeNull();
  expect(current!.hyperCoreFundingDraft).toEqual({
    source: 'hypercore-spot',
    requestedUsd6: expected.hyperCoreLeg!.usd6,
    weightBps: expected.hyperCoreLeg!.weightBps,
  });
});
