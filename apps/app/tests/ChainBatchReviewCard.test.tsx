// @vitest-environment jsdom
import { clickUi, renderInvestUi } from './support/investUiHarness';
import { expect, it, vi } from 'vitest';
import { ChainBatchReviewCard } from '@/components/invest/ChainBatchReviewCard';
import { reviewedInvestFixture } from './support/investReviewFixture';
vi.mock('@/components/invest/simulation/SimulationReviewBody', () => ({
  SimulationReviewBody: () => <span>Tenderly evidence</span>,
}));
it('keeps costs visible and destination details collapsed in the sequence', async () => {
  const container = await renderInvestUi(
    <ChainBatchReviewCard
      batch={reviewedInvestFixture}
      stepLabel="Step 1 of 2"
    />,
  );
  expect(container.textContent).toContain('Step 1 of 2 · Base');
  expect(container.textContent).toContain('$36.00');
  expect(container.textContent).toContain('Transactions');
  expect(container.textContent).toContain('Source gas');
  expect(container.textContent).not.toContain('Funding');
  await clickUi(container, 'Destinations (1)');
  expect(container.textContent).toContain('Funding');
});
