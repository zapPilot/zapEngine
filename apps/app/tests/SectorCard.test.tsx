// @vitest-environment jsdom
import {
  changeInput,
  clickUi,
  renderInvestUi,
} from './support/investUiHarness';
import { expect, it, vi } from 'vitest';
import { SectorCard } from '@/components/invest/SectorCard';
import { INVEST_SECTORS } from '@/integration/investSectorModel';
it('locks S&P 500 with a visible dependency and no editor or disclosure', async () => {
  const sector = INVEST_SECTORS[2]!;
  const container = await renderInvestUi(
    <SectorCard sector={sector} percentInput="0" positions={[]} />,
  );
  expect(container.textContent).toContain(sector.lockedReason);
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelector('button')).toBeNull();
  expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
});
it('keeps partial percentage edits and reveals protocol details on demand', async () => {
  const onChange = vi.fn();
  const sector = INVEST_SECTORS[1]!;
  const container = await renderInvestUi(
    <SectorCard
      sector={sector}
      percentInput="60"
      positions={sector.positions.map((p) => ({ ...p, usd6: 36000000n }))}
      onChangePercent={onChange}
    />,
  );
  expect(container.textContent).not.toContain('Morpho USDC vault');
  const input = container.querySelector('input')!;
  expect(input.getAttribute('aria-label')).toBe('Stable allocation percentage');
  await changeInput(input, '12.');
  expect(onChange).toHaveBeenCalledWith('12.');
  await clickUi(container, 'Stable details');
  expect(container.textContent).toContain('Morpho USDC vault');
  expect(container.textContent).toContain('Base · 5% of Stable');
  expect(container.textContent).toContain('$36.00');
});
