// @vitest-environment jsdom
import { clickUi, renderInvestUi } from './support/investUiHarness';
import { expect, it, vi } from 'vitest';
import { FundingPlanDisclosure } from '@/components/invest/FundingPlanDisclosure';
import {
  STATIC_FUNDING_RANKING,
  type FundingPlan,
} from '@/integration/investFundingPlanner';
const sources = STATIC_FUNDING_RANKING;
const plan: FundingPlan = {
  stages: null,
  blockers: [],
  warnings: [],
  assignments: [
    {
      positionId: 'hlp',
      weightBps: 2400,
      usd6: 24000000n,
      source: sources.hlp[0]!,
      fromAmount: '24000000',
      availableUsd6: 100000000n,
      pinned: true,
    },
  ],
  options: {
    hlp: sources.hlp.map((candidate, i) => ({
      candidate,
      selected: i === 0,
      availableUsd6: 100000000n,
      rejection: i < 2 ? null : 'insufficient',
    })),
  },
};
it('hides source controls, exposes viable options and keeps direct HLP entry advanced', async () => {
  const onSource = vi.fn();
  const onRecommended = vi.fn();
  const onHlp = vi.fn();
  const container = await renderInvestUi(
    <FundingPlanDisclosure
      plan={plan}
      hasAmount
      isConnected
      hasOverrides
      onChangeSource={onSource}
      onUseRecommended={onRecommended}
      onOpenHlpSpotDeposit={onHlp}
    />,
  );
  expect(container.textContent).toContain(
    'Custom · Arbitrum USDC · 1 wallet batches',
  );
  expect(container.textContent).not.toContain('Change source');
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await clickUi(container, "How we'll fund this");
  expect(container.textContent).toContain('$24.00');
  await clickUi(container, 'Change source for HLP');
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
    'Base USDC',
  );
  expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain(
    'Ethereum USDC',
  );
  await clickUi(container, 'Base USDC');
  expect(onSource).toHaveBeenCalledWith('hlp', sources.hlp[1]!.token);
  await clickUi(container, 'Use recommended');
  expect(onRecommended).toHaveBeenCalledOnce();
  await clickUi(
    container,
    'Already have USDC on Hyperliquid? Deposit it directly',
  );
  expect(onHlp).toHaveBeenCalledOnce();
  for (const forbidden of [
    'Funding route',
    'Resolved after you enter an amount',
    'Deposit from your Hyperliquid balance instead',
  ])
    expect(container.textContent).not.toContain(forbidden);
});
it('omits reset and source picker when no alternatives are viable', async () => {
  const restricted = {
    ...plan,
    options: { hlp: plan.options.hlp!.slice(0, 1) },
  };
  const container = await renderInvestUi(
    <FundingPlanDisclosure
      plan={restricted}
      hasAmount={false}
      isConnected
      hasOverrides={false}
      onChangeSource={vi.fn()}
      onUseRecommended={vi.fn()}
      onOpenHlpSpotDeposit={vi.fn()}
    />,
  );
  await clickUi(container, "How we'll fund this");
  expect(container.textContent).not.toContain('Use recommended');
  expect(container.textContent).not.toContain('Change source');
});
