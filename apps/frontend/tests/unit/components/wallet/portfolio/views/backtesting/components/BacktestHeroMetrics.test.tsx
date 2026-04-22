import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BacktestHeroMetrics } from '@/components/wallet/portfolio/views/backtesting/components/BacktestHeroMetrics';
import type { HeroMetric } from '@/components/wallet/portfolio/views/backtesting/components/backtestTerminalMetrics';

const sampleMetrics: HeroMetric[] = [
  {
    label: 'ROI',
    value: '+25.5%',
    bar: '████████░░',
    color: 'text-emerald-400',
  },
  { label: 'CALMAR', value: '1.24', bar: '██████░░░░', color: 'text-cyan-400' },
  {
    label: 'MAX DRAWDOWN',
    value: '12.3%',
    bar: '█████░░░░░',
    color: 'text-rose-400',
  },
];

describe('BacktestHeroMetrics', () => {
  it('returns null when metrics array is empty', () => {
    const { container } = render(<BacktestHeroMetrics metrics={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all metric labels', () => {
    render(<BacktestHeroMetrics metrics={sampleMetrics} />);

    expect(screen.getByText('ROI')).toBeDefined();
    expect(screen.getByText('CALMAR')).toBeDefined();
    expect(screen.getByText('MAX DRAWDOWN')).toBeDefined();
  });

  it('renders all metric values', () => {
    render(<BacktestHeroMetrics metrics={sampleMetrics} />);

    expect(screen.getByText('+25.5%')).toBeDefined();
    expect(screen.getByText('1.24')).toBeDefined();
    expect(screen.getByText('12.3%')).toBeDefined();
  });

  it('renders all metric ASCII bars', () => {
    render(<BacktestHeroMetrics metrics={sampleMetrics} />);

    expect(screen.getByText('████████░░')).toBeDefined();
    expect(screen.getByText('██████░░░░')).toBeDefined();
    expect(screen.getByText('█████░░░░░')).toBeDefined();
  });

  it('applies the correct color class to each value', () => {
    render(<BacktestHeroMetrics metrics={sampleMetrics} />);

    const roiValue = screen.getByText('+25.5%');
    expect(roiValue.className).toContain('text-emerald-400');

    const calmarValue = screen.getByText('1.24');
    expect(calmarValue.className).toContain('text-cyan-400');

    const drawdownValue = screen.getByText('12.3%');
    expect(drawdownValue.className).toContain('text-rose-400');
  });

  it('does not add md:border-l to the first metric, adds it to subsequent ones', () => {
    const { container } = render(
      <BacktestHeroMetrics metrics={sampleMetrics} />,
    );

    const metricDivs = container.querySelectorAll('.grid > div');
    expect(metricDivs[0]?.className).not.toContain('md:border-l');
    expect(metricDivs[1]?.className).toContain('md:border-l');
    expect(metricDivs[2]?.className).toContain('md:border-l');
  });

  it('renders correctly with a single metric', () => {
    render(<BacktestHeroMetrics metrics={[sampleMetrics[0]]} />);

    expect(screen.getByText('ROI')).toBeDefined();
    expect(screen.getByText('+25.5%')).toBeDefined();
  });
});
