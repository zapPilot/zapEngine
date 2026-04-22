/**
 * ChartIndicator - Unit Tests
 *
 * Tests the ChartIndicator component covering different chart types,
 * variants (circle, multi-circle, flagged), and aria labels.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChartIndicator } from '@/components/charts/ChartIndicator';

function renderChartIndicator(
  hoveredPoint: Parameters<typeof ChartIndicator>[0]['hoveredPoint'],
) {
  return render(
    <svg>
      <ChartIndicator hoveredPoint={hoveredPoint} />
    </svg>,
  );
}

describe('ChartIndicator', () => {
  it('renders nothing when no hoveredPoint', () => {
    const { container } = renderChartIndicator(null);
    expect(container.querySelector('svg')?.childElementCount).toBe(0);
  });

  describe('Single Circle Variant (Default)', () => {
    it('renders performance chart indicator correctly', () => {
      const point = {
        date: '2025-01-01',
        value: 1000,
        chartType: 'performance',
        x: 10,
        y: 10,
      };

      const { container } = renderChartIndicator(point);

      const svgGroup = screen.getByRole('img');
      expect(svgGroup).toBeInTheDocument();
      // Aria label check
      expect(svgGroup).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Portfolio value on Jan 1, 2025 is $1,000'),
      );

      // Check circle
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThan(0);
    });

    it('renders sharpe chart indicator with interpretation', () => {
      const point = {
        date: '2025-01-01',
        value: 2.5,
        sharpe: 2.5,
        interpretation: 'Excellent',
        chartType: 'sharpe',
        x: 10,
        y: 10,
      };

      renderChartIndicator(point);

      const svgGroup = screen.getByRole('img');
      expect(svgGroup).toHaveAttribute(
        'aria-label',
        expect.stringMatching(/Sharpe ratio.*2.50.*Excellent/),
      );
    });

    it('renders volatility chart indicator with high volatility pulse', () => {
      const point = {
        date: '2025-01-01',
        value: 30,
        volatility: 30, // High volatility > 25
        riskLevel: 'High',
        chartType: 'volatility',
        x: 10,
        y: 10,
      };

      const { container } = renderChartIndicator(point);

      // Should have extra pulse circle
      const circles = container.querySelectorAll('circle');
      // Main circle + pulse circle
      expect(circles.length).toBeGreaterThanOrEqual(2);

      const svgGroup = screen.getByRole('img');
      expect(svgGroup).toHaveAttribute(
        'aria-label',
        expect.stringContaining('High risk'),
      );
    });
  });

  describe('Multi Circle Variant (Allocation)', () => {
    it('renders stacked circles for multiple assets', () => {
      const point = {
        date: '2025-01-01',
        value: 100,
        btc: 60,
        eth: 30,
        stablecoin: 10,
        altcoin: 0,
        chartType: 'asset-allocation',
        x: 10,
        y: 10,
      };

      const { container } = renderChartIndicator(point);

      const circles = container.querySelectorAll('circle');
      // 3 significant assets (>1%) -> 3 circles
      expect(circles.length).toBe(3);
    });

    it('renders single circle if only one asset significant', () => {
      const point = {
        date: '2025-01-01',
        value: 100,
        btc: 100,
        eth: 0,
        stablecoin: 0,
        altcoin: 0,
        chartType: 'asset-allocation',
        x: 10,
        y: 10,
      };

      const { container } = renderChartIndicator(point);

      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBe(1);
    });
  });

  describe('Flagged Circle Variant (Drawdown)', () => {
    it('renders flag for recovery points', () => {
      const point = {
        date: '2025-01-01',
        value: 100,
        drawdown: 0,
        isRecoveryPoint: true,
        chartType: 'drawdown-recovery',
        x: 10,
        y: 10,
      };

      const { container } = renderChartIndicator(point);

      // Check for path (flag) and line (pole)
      expect(container.querySelector('path')).toBeInTheDocument();
      expect(container.querySelector('line')).toBeInTheDocument();

      const svgGroup = screen.getByRole('img');
      expect(svgGroup).toHaveAttribute(
        'aria-label',
        expect.stringContaining('marks a new peak'),
      );
    });

    it('renders normal circle for non-recovery drawdown points', () => {
      const point = {
        date: '2025-01-01',
        value: 100,
        drawdown: -10,
        isRecoveryPoint: false,
        chartType: 'drawdown-recovery',
        x: 10,
        y: 10,
      };

      const { container } = renderChartIndicator(point);

      expect(container.querySelector('path')).not.toBeInTheDocument(); // No flag
    });
  });
});
