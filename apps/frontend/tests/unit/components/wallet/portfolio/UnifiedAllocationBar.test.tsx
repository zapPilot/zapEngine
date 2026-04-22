import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  UnifiedAllocationBar,
  type UnifiedSegment,
} from '@/components/wallet/portfolio/components/allocation';
import { UNIFIED_COLORS } from '@/constants/assets';

const mockSegments: UnifiedSegment[] = [
  { category: 'btc', label: 'BTC', percentage: 40, color: UNIFIED_COLORS.BTC },
  {
    category: 'eth',
    label: 'ETH',
    percentage: 20,
    color: UNIFIED_COLORS.ETH,
  },
  {
    category: 'stable',
    label: 'STABLE',
    percentage: 25,
    color: UNIFIED_COLORS.STABLE,
  },
  { category: 'alt', label: 'ALT', percentage: 15, color: UNIFIED_COLORS.ALT },
];

describe('UnifiedAllocationBar', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Basic Rendering
  // ─────────────────────────────────────────────────────────────────────────

  it('renders all segments', () => {
    render(<UnifiedAllocationBar segments={mockSegments} />);

    // Check segments are rendered via test IDs
    expect(screen.getByTestId('unified-segment-btc')).toBeInTheDocument();
    expect(screen.getByTestId('unified-segment-eth')).toBeInTheDocument();
    expect(screen.getByTestId('unified-segment-stable')).toBeInTheDocument();
    expect(screen.getByTestId('unified-segment-alt')).toBeInTheDocument();
  });

  it('renders container with correct test ID', () => {
    render(<UnifiedAllocationBar segments={mockSegments} />);

    expect(screen.getByTestId('unified-allocation-bar')).toBeInTheDocument();
  });

  it('renders nothing when segments are empty', () => {
    const { container } = render(<UnifiedAllocationBar segments={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Title
  // ─────────────────────────────────────────────────────────────────────────

  it('renders title when provided', () => {
    render(
      <UnifiedAllocationBar
        segments={mockSegments}
        title="Target Allocation"
      />,
    );

    expect(screen.getByText('Target Allocation')).toBeInTheDocument();
  });

  it('does not render title when not provided', () => {
    render(<UnifiedAllocationBar segments={mockSegments} />);

    expect(screen.queryByText('Target Allocation')).not.toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Labels
  // ─────────────────────────────────────────────────────────────────────────

  it('shows inline labels for large segments by default', () => {
    render(<UnifiedAllocationBar segments={mockSegments} />);

    // BTC is 40% > 10% threshold, should show label
    expect(screen.getByText(/BTC 40%/)).toBeInTheDocument();

    // ETH is 20% > 10%, should show label
    expect(screen.getByText(/ETH 20%/)).toBeInTheDocument();

    // STABLE is 25% > 10%, should show label
    expect(screen.getByText(/STABLE 25%/)).toBeInTheDocument();

    // ALT is 15% > 10%, should show label
    expect(screen.getByText(/ALT 15%/)).toBeInTheDocument();
  });

  it('hides inline labels when showLabels is false', () => {
    render(<UnifiedAllocationBar segments={mockSegments} showLabels={false} />);

    expect(screen.queryByText(/BTC 40%/)).not.toBeInTheDocument();
  });

  it('respects custom labelThreshold', () => {
    const segments: UnifiedSegment[] = [
      {
        category: 'btc',
        label: 'BTC',
        percentage: 15,
        color: UNIFIED_COLORS.BTC,
      },
      {
        category: 'stable',
        label: 'STABLE',
        percentage: 85,
        color: UNIFIED_COLORS.STABLE,
      },
    ];

    render(<UnifiedAllocationBar segments={segments} labelThreshold={20} />);

    // BTC is 15% < 20% threshold, should NOT show inline label
    expect(screen.queryByText(/BTC 15%/)).not.toBeInTheDocument();

    // STABLE is 85% > 20% threshold, should show inline label
    expect(screen.getByText(/STABLE 85%/)).toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Legend
  // ─────────────────────────────────────────────────────────────────────────

  it('shows legend by default', () => {
    render(<UnifiedAllocationBar segments={mockSegments} />);

    expect(screen.getByTestId('allocation-legend')).toBeInTheDocument();
  });

  it('hides legend when showLegend is false', () => {
    render(<UnifiedAllocationBar segments={mockSegments} showLegend={false} />);

    expect(screen.queryByTestId('allocation-legend')).not.toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Size Variants
  // ─────────────────────────────────────────────────────────────────────────

  it('renders with sm size class', () => {
    render(<UnifiedAllocationBar segments={mockSegments} size="sm" />);

    const segment = screen.getByTestId('unified-segment-btc');
    expect(segment).toHaveClass('h-3');
  });

  it('renders with md size class by default', () => {
    render(<UnifiedAllocationBar segments={mockSegments} />);

    const segment = screen.getByTestId('unified-segment-btc');
    expect(segment).toHaveClass('h-5');
  });

  it('renders with lg size class', () => {
    render(<UnifiedAllocationBar segments={mockSegments} size="lg" />);

    const segment = screen.getByTestId('unified-segment-btc');
    expect(segment).toHaveClass('h-8');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Custom testIdPrefix
  // ─────────────────────────────────────────────────────────────────────────

  it('uses custom testIdPrefix', () => {
    render(
      <UnifiedAllocationBar segments={mockSegments} testIdPrefix="target" />,
    );

    expect(screen.getByTestId('target-container')).toBeInTheDocument();
    expect(screen.getByTestId('target-btc')).toBeInTheDocument();
    expect(screen.getByTestId('target-eth')).toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Segment Widths
  // ─────────────────────────────────────────────────────────────────────────

  it('sets segment width based on percentage', () => {
    render(<UnifiedAllocationBar segments={mockSegments} />);

    const btcSegment = screen.getByTestId('unified-segment-btc');
    // Style should include width: 40%
    expect(btcSegment).toHaveStyle({ width: '40%' });

    const stableSegment = screen.getByTestId('unified-segment-stable');
    expect(stableSegment).toHaveStyle({ width: '25%' });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Accessibility
  // ─────────────────────────────────────────────────────────────────────────

  it('provides title attribute for segments', () => {
    render(<UnifiedAllocationBar segments={mockSegments} />);

    const btcSegment = screen.getByTestId('unified-segment-btc');
    expect(btcSegment).toHaveAttribute('title', 'BTC: 40.0%');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────

  it('handles single segment', () => {
    const singleSegment: UnifiedSegment[] = [
      {
        category: 'btc',
        label: 'BTC',
        percentage: 100,
        color: UNIFIED_COLORS.BTC,
      },
    ];

    render(<UnifiedAllocationBar segments={singleSegment} />);

    expect(screen.getByTestId('unified-segment-btc')).toBeInTheDocument();
    expect(screen.getByText(/BTC 100%/)).toBeInTheDocument();
  });

  it('handles very small percentages with minimum width', () => {
    const tinySegment: UnifiedSegment[] = [
      {
        category: 'alt',
        label: 'ALT',
        percentage: 0.1,
        color: UNIFIED_COLORS.ALT,
      },
      {
        category: 'btc',
        label: 'BTC',
        percentage: 99.9,
        color: UNIFIED_COLORS.BTC,
      },
    ];

    render(<UnifiedAllocationBar segments={tinySegment} />);

    // Both segments should be visible (min width 0.5%)
    expect(screen.getByTestId('unified-segment-alt')).toBeInTheDocument();
    expect(screen.getByTestId('unified-segment-btc')).toBeInTheDocument();
  });
});
