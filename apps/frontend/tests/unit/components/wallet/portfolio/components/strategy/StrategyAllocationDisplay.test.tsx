import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StrategyAllocationDisplay } from '@/components/wallet/portfolio/components/strategy/StrategyAllocationDisplay';

describe('StrategyAllocationDisplay', () => {
  const targetAllocation = {
    spot: 40,
    stable: 60,
  };

  it('should render both allocation bars', () => {
    render(<StrategyAllocationDisplay targetAllocation={targetAllocation} />);

    expect(screen.getByText('Target Spot')).toBeInTheDocument();
    expect(screen.getByText('Target Stable')).toBeInTheDocument();
  });

  it('should display correct percentages', () => {
    render(<StrategyAllocationDisplay targetAllocation={targetAllocation} />);

    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('should render progress bars with correct widths', () => {
    const { container } = render(
      <StrategyAllocationDisplay targetAllocation={targetAllocation} />,
    );

    const progressBars = container.querySelectorAll(
      '.bg-orange-500, .bg-emerald-500',
    );

    expect(progressBars[0]).toHaveStyle({ width: '40%' }); // Spot
    expect(progressBars[1]).toHaveStyle({ width: '60%' }); // Stable
  });

  it('should show maintain position message when hideAllocationTarget is true', () => {
    render(
      <StrategyAllocationDisplay
        targetAllocation={targetAllocation}
        hideAllocationTarget={true}
      />,
    );

    expect(screen.getByText('Maintain current position')).toBeInTheDocument();
    expect(screen.queryByText('Target Spot')).not.toBeInTheDocument();
  });

  it('should handle zero allocations', () => {
    const zeroAllocation = {
      spot: 0,
      stable: 100,
    };

    render(<StrategyAllocationDisplay targetAllocation={zeroAllocation} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should render with correct color classes', () => {
    const { container } = render(
      <StrategyAllocationDisplay targetAllocation={targetAllocation} />,
    );

    expect(container.querySelector('.bg-orange-500')).toBeInTheDocument(); // Spot
    expect(container.querySelector('.bg-emerald-500')).toBeInTheDocument(); // Stable
  });

  it('should show pulse animation on maintain position indicator', () => {
    const { container } = render(
      <StrategyAllocationDisplay
        targetAllocation={targetAllocation}
        hideAllocationTarget={true}
      />,
    );

    const pulseIndicator = container.querySelector('.animate-pulse');
    expect(pulseIndicator).toBeInTheDocument();
  });
});
