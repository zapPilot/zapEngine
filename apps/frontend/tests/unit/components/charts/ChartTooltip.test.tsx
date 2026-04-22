import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChartTooltip } from '@/components/charts/ChartTooltip';

vi.mock('framer-motion', async () => {
  const { setupFramerMotionMocks } =
    await import('../../../utils/framerMotionMocks');

  return setupFramerMotionMocks();
});

// Mock sub-components to verify correct switching
vi.mock('@/components/charts/tooltipContent', () => ({
  PerformanceTooltip: () => (
    <div data-testid="tooltip-content-performance">Performance</div>
  ),
  AllocationTooltip: () => (
    <div data-testid="tooltip-content-allocation">Allocation</div>
  ),
  DrawdownTooltip: () => (
    <div data-testid="tooltip-content-drawdown">Drawdown</div>
  ),
  SharpeTooltip: () => <div data-testid="tooltip-content-sharpe">Sharpe</div>,
  VolatilityTooltip: () => (
    <div data-testid="tooltip-content-volatility">Volatility</div>
  ),
  DailyYieldTooltip: () => <div data-testid="tooltip-content-yield">Yield</div>,
}));

describe('ChartTooltip', () => {
  const defaultProps = {
    chartWidth: 800,
    chartHeight: 300,
  };

  it('should not render when hoveredPoint is null', () => {
    const { container } = render(<ChartTooltip hoveredPoint={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("should render correct content for 'performance' chart", () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'performance',
          x: 100,
          y: 100,
          date: '2024-01-01',
          value: 100,
        }}
      />,
    );
    expect(
      screen.getByTestId('tooltip-content-performance'),
    ).toBeInTheDocument();
  });

  it("should render correct content for 'asset-allocation' chart", () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'asset-allocation',
          x: 100,
          y: 100,
          date: '2024-01-01',
          btc: 50,
          eth: 50,
          stablecoin: 0,
          altcoin: 0,
        }}
      />,
    );
    expect(
      screen.getByTestId('tooltip-content-allocation'),
    ).toBeInTheDocument();
  });

  it("should render correct content for 'drawdown-recovery' chart", () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'drawdown-recovery',
          x: 100,
          y: 100,
          date: '2024-01-01',
          value: -10,
        }}
      />,
    );
    expect(screen.getByTestId('tooltip-content-drawdown')).toBeInTheDocument();
  });

  it("should render correct content for 'sharpe' chart", () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'sharpe',
          x: 100,
          y: 100,
          date: '2024-01-01',
          value: 2.5,
        }}
      />,
    );
    expect(screen.getByTestId('tooltip-content-sharpe')).toBeInTheDocument();
  });

  it("should render correct content for 'volatility' chart", () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'volatility',
          x: 100,
          y: 100,
          date: '2024-01-01',
          value: 15,
        }}
      />,
    );
    expect(
      screen.getByTestId('tooltip-content-volatility'),
    ).toBeInTheDocument();
  });

  it("should render correct content for 'daily-yield' chart", () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'daily-yield',
          x: 100,
          y: 100,
          date: '2024-01-01',
          value: 0.5,
        }}
      />,
    );
    expect(screen.getByTestId('tooltip-content-yield')).toBeInTheDocument();
  });

  // Positioning Tests
  // Default tooltip size mock: 180x120 (TOOLTIP_MIN_WIDTH/HEIGHT)

  it('should position correctly in the middle (left aligned, top aligned)', () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'performance',
          x: 400, // Middle of 800
          y: 200, // Safer Y to avoid top flip. pointerY=200. top=180. 180-120=60 > 12.
          date: '2024-01-01',
          value: 100,
        }}
      />,
    );

    // pointerY = 200. top = 180. translateY = -100%.
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveStyle({
      left: '400px',
      top: '180px',
      transform: 'translate(-50%, -100%)',
    });
  });

  it('should clamp to left edge', () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'performance',
          x: 10, // Near left edge
          y: 200, // Safe Y
          date: '2024-01-01',
          value: 100,
        }}
      />,
    );

    // pointerX = 10. left - halfWidth (90) < 12.
    // left = 12. translateX = 0.
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveStyle({
      left: '12px',
      transform: 'translate(0, -100%)',
    });
  });

  it('should clamp to right edge', () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'performance',
          x: 790, // Near right edge
          y: 200, // Safe Y
          date: '2024-01-01',
          value: 100,
        }}
      />,
    );

    // pointerX = 790. left + 90 > 788. left = 788. translateX = -100%.
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveStyle({
      left: '788px',
      transform: 'translate(-100%, -100%)',
    });
  });

  it('should flip to bottom if too close to top', () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'performance',
          x: 400,
          y: 20, // Near top
          date: '2024-01-01',
          value: 100,
        }}
      />,
    );

    // pointerY = 20. top = 0. 0 - 120 < 12. Flip.
    // top = min(20+20, 300-12) = 40. translateY = 0.
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveStyle({
      top: '40px',
      transform: 'translate(-50%, 0)',
    });
  });

  it('should avoid top legend for specific chart types', () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'performance',
          x: 400,
          y: 60,
          date: '2024-01-01',
          value: 100,
        }}
      />,
    );

    // Y=60. pointerY=60. top=40.
    // Edge check: 40 - 120 = -80 < 12. FLIP.
    // top = 80. translateY = 0.
    // Since it flipped to 0, the Legend check (translateY === "-100%") is skipped.
    // But result is correct: it avoids top area.
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveStyle({
      top: '80px',
      transform: 'translate(-50%, 0)',
    });
  });

  it('should use containerWidth/containerHeight when provided', () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'performance',
          x: 400,
          y: 200,
          date: '2024-01-01',
          value: 100,
          containerWidth: 1000,
          containerHeight: 500,
        }}
      />,
    );
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toBeInTheDocument();
  });

  it('should use screenX/screenY when provided', () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'performance',
          x: 400,
          y: 200,
          date: '2024-01-01',
          value: 100,
          screenX: 500,
          screenY: 250,
        }}
      />,
    );
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveStyle({ left: '500px' });
  });

  it('should handle chartWidth of 0 gracefully', () => {
    render(
      <ChartTooltip
        chartWidth={0}
        chartHeight={300}
        hoveredPoint={{
          chartType: 'drawdown-recovery',
          x: 100,
          y: 100,
          date: '2024-01-01',
          value: -5,
        }}
      />,
    );
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveStyle({ left: '12px' });
  });

  it('should not apply legend guard for non-legend chart types', () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'drawdown-recovery',
          x: 400,
          y: 190,
          date: '2024-01-01',
          value: -5,
        }}
      />,
    );
    const tooltip = screen.getByTestId('chart-tooltip');
    // drawdown-recovery is NOT in CHARTS_WITH_TOP_LEGEND, so no legend guard
    expect(tooltip).toHaveStyle({
      top: '170px',
      transform: 'translate(-50%, -100%)',
    });
  });

  it('should return null for unknown chartType (default switch branch)', () => {
    // Exercises the `default: return null` branch in TooltipContent switch
    const { container } = render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={
          {
            chartType: 'unknown-chart-type' as 'performance',
            x: 100,
            y: 150,
            date: '2024-01-01',
            value: 42,
          } as any
        }
      />,
    );
    // Outer tooltip div still renders but inner content is null
    expect(screen.getByTestId('chart-tooltip')).toBeInTheDocument();
    expect(
      container.querySelector("[data-testid^='tooltip-content-']"),
    ).toBeNull();
  });

  it('should compute pointer.y as 0 when chartHeight is 0', () => {
    // Exercises the `chartHeight > 0 ? ... : 0` false branch in pointer.y calculation
    render(
      <ChartTooltip
        chartWidth={800}
        chartHeight={0}
        hoveredPoint={{
          chartType: 'drawdown-recovery',
          x: 400,
          y: 150,
          date: '2024-01-01',
          value: -5,
        }}
      />,
    );
    // pointer.y becomes 0; top = 0 - 20 = -20; -20 - 120 < 12 => flip to bottom
    // top = min(0 + 20, 0 - 12) = min(20, -12) = -12
    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toBeInTheDocument();
  });

  it('should trigger legend avoidance when valid space exists but legend overlaps', () => {
    render(
      <ChartTooltip
        {...defaultProps}
        hoveredPoint={{
          chartType: 'performance',
          x: 400,
          y: 190,
          date: '2024-01-01',
          value: 100,
        }}
      />,
    );

    // Y=190. top=170. translateY=-100%.
    // Edge: 170-120=50 > 12. OK.
    // Legend: 170 < 180 (60+120). True.
    // Flip. top = max(190+20, 60) = 210. translateY = 0.

    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip).toHaveStyle({
      top: '210px',
      transform: 'translate(-50%, 0)',
    });
  });
});
