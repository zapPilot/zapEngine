// @vitest-environment jsdom
import { clickUi, renderInvestUi } from './support/investUiHarness';
import { expect, it, vi } from 'vitest';
import { FundingPlanDisclosure } from '@/components/invest/FundingPlanDisclosure';
import {
  ARBITRUM_DEPOSIT_TOKENS as A,
  BASE_DEPOSIT_TOKENS as B,
  ETHEREUM_DEPOSIT_TOKENS as E,
} from '@/integration/depositTokens';
import {
  planFunding,
  type FundingPreferences,
} from '@/integration/investFundingPlanner';
import { fundingSourceRows } from '@/integration/investFundingSources';
import {
  DEFAULT_SECTOR_WEIGHTS,
  resolveTargetAllocations,
} from '@/integration/investSectorModel';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import { balanceRow as row } from './support/fundingBalanceRow';

const allocations = resolveTargetAllocations(DEFAULT_SECTOR_WEIGHTS);

function scenario(
  rows: ChainTokenBalanceRow[],
  preferences: FundingPreferences = {},
) {
  const supply = { rows, unavailableChainIds: [] };
  const constraints = { preferences, gasReserveUsd: 5 };
  const plan = planFunding({
    demand: { totalUsd6: '100000000', allocations },
    supply,
    constraints,
  });
  return {
    plan,
    sources: fundingSourceRows({
      assignments: plan.assignments,
      supply,
      preferences,
      gasReserveUsd: 5,
    }),
  };
}

it('lists the balances the money comes from, not the destinations it goes to', async () => {
  const onPreference = vi.fn();
  const onHlp = vi.fn();
  const { plan, sources } = scenario([
    row(B[0], 100),
    row(A[0], 100),
    row(A[1], 50),
    row(A[2], 60),
    row(E[0], 80),
  ]);
  const container = await renderInvestUi(
    <FundingPlanDisclosure
      plan={plan}
      sources={sources}
      hasAmount
      isConnected
      hasPreferences={false}
      onChangePreference={onPreference}
      onUseRecommended={vi.fn()}
      onOpenHlpSpotDeposit={onHlp}
    />,
  );
  expect(container.textContent).toContain('Selected automatically · 2 sources');
  expect(container.querySelector('[role="dialog"]')).toBeNull();

  await clickUi(container, "How we'll fund this");
  expect(container.textContent).toContain('Arbitrum USDC');
  expect(container.textContent).toContain('$64.00');
  // Rows answer "which balance", so no destination is ever a row heading.
  for (const forbidden of [
    'Morpho USDC vault',
    'Diversified GM basket',
    'Official HLP vault',
  ])
    expect(container.textContent).not.toContain(forbidden);
  expect(container.textContent).toContain('Not used');
  expect(container.textContent).toContain('2 wallet batches');
  // The ranking is a static cost tier, so a fee or route claim would be made up.
  expect(container.textContent).not.toMatch(/Est\.? fee|~\$|Best route/);
  expect(container.textContent).not.toContain('Use recommended');

  await clickUi(container, 'Change source for Arbitrum');
  const sheet = () => container.querySelector('[role="dialog"]')!;
  for (const label of ['Arbitrum USDT', 'Arbitrum ETH', 'Automatic'])
    expect(sheet().textContent).toContain(label);
  expect(sheet().textContent).not.toContain('Base USDC');

  await clickUi(container, 'Arbitrum USDT');
  expect(onPreference).toHaveBeenCalledWith(42161, 'USDT');

  await clickUi(container, 'Change source for Arbitrum');
  await clickUi(container, 'Automatic');
  expect(onPreference).toHaveBeenLastCalledWith(42161, null);

  await clickUi(
    container,
    'Already have USDC on Hyperliquid? Deposit it directly',
  );
  expect(onHlp).toHaveBeenCalledOnce();
});

it('offers reset only with a preference and hides the picker with nothing to switch to', async () => {
  const onRecommended = vi.fn();
  const { plan, sources } = scenario([row(B[0], 100), row(A[0], 100)], {
    42161: 'USDC',
  });
  const container = await renderInvestUi(
    <FundingPlanDisclosure
      plan={plan}
      sources={sources}
      hasAmount={false}
      isConnected
      hasPreferences
      onChangePreference={vi.fn()}
      onUseRecommended={onRecommended}
      onOpenHlpSpotDeposit={vi.fn()}
    />,
  );
  expect(container.textContent).toContain('Custom · 2 sources');
  await clickUi(container, "How we'll fund this");
  expect(container.textContent).not.toContain('Change source');
  await clickUi(container, 'Use recommended');
  expect(onRecommended).toHaveBeenCalledOnce();
  // No amount entered yet, so the plan is priced off the minimum, not shown.
  expect(container.textContent).not.toContain('$36.00');
});
