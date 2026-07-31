import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ChartHoverLayer } from '../ChartHoverLayer.client';
import type { ChartMarker } from '../ChartHoverLayer.client';

const DATES = [
  '2026-01-01',
  '2026-01-02',
  '2026-01-03',
  '2026-01-04',
  '2026-01-05',
];
const VALUES = [100, 110, 120, 130, 140];

const MARKERS: ChartMarker[] = [
  {
    index: 1,
    y: 40,
    asset: 'ETH',
    action: 'rotate',
    label: 'Rotated BTC into ETH',
  },
  { index: 3, y: 20, asset: 'SPY', action: 'sell', label: 'Sold SPY' },
];

function renderLayer(markers: ChartMarker[] = []) {
  return render(
    <ChartHoverLayer
      total={DATES.length}
      ariaLabel="Strategy NAV by date"
      labelForIndex={(index) => DATES[index]!}
      rowsForIndex={(index) => [
        {
          id: 'strategy',
          label: 'Strategy',
          value: VALUES[index]!.toFixed(2),
          color: 'var(--accent)',
        },
      ]}
      focusYForIndex={() => 100}
      markers={markers}
    >
      <svg data-testid="chart" />
    </ChartHoverLayer>,
  );
}

function surface() {
  return screen.getByRole('slider');
}

describe('ChartHoverLayer', () => {
  beforeEach(() => {
    // jsdom has no layout engine; without this the surface reports a zero-width
    // box and indexFromPointer's guard would (correctly) refuse to resolve.
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(
      {
        left: 0,
        width: 500,
        top: 0,
        height: 200,
        right: 500,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      },
    );
  });

  it('renders the chart it wraps and stays quiet until pointed at', () => {
    const { container } = renderLayer();

    expect(screen.getByTestId('chart')).toBeInTheDocument();
    expect(container.querySelector('.chart-tooltip')).toBeNull();
  });

  it('reads out the nearest date and value under the pointer', () => {
    renderLayer();

    fireEvent.pointerMove(surface(), { clientX: 250 });

    expect(screen.getByText('2026-01-03')).toBeInTheDocument();
    expect(screen.getByText('120.00')).toBeInTheDocument();
  });

  it('clears the readout when the pointer leaves or is cancelled', () => {
    const { container } = renderLayer();

    fireEvent.pointerMove(surface(), { clientX: 250 });
    fireEvent.pointerLeave(surface());
    expect(container.querySelector('.chart-tooltip')).toBeNull();

    fireEvent.pointerMove(surface(), { clientX: 250 });
    fireEvent.pointerCancel(surface());
    expect(container.querySelector('.chart-tooltip')).toBeNull();
  });

  it('gives keyboard users the identical readout the tooltip shows', () => {
    renderLayer(MARKERS);

    fireEvent.focus(surface());
    expect(surface()).toHaveAttribute('aria-valuenow', '0');

    fireEvent.keyDown(surface(), { key: 'ArrowRight' });

    expect(surface()).toHaveAttribute('aria-valuenow', '1');
    const readout = surface().getAttribute('aria-valuetext') ?? '';
    // Same three facts the tooltip renders, so neither channel is privileged.
    expect(readout).toContain('2026-01-02');
    expect(readout).toContain('110.00');
    expect(readout).toContain('Rotated BTC into ETH');
    expect(screen.getByText('2026-01-02')).toBeInTheDocument();
    expect(screen.getByText('Rotated BTC into ETH')).toBeInTheDocument();
  });

  it('exposes the series bounds on the scrubber', () => {
    renderLayer();

    expect(surface()).toHaveAttribute('aria-valuemin', '0');
    expect(surface()).toHaveAttribute('aria-valuemax', '4');
  });

  it('jumps between marked events on shift and arrow', () => {
    renderLayer(MARKERS);

    fireEvent.focus(surface());
    fireEvent.keyDown(surface(), { key: 'ArrowRight', shiftKey: true });

    expect(surface()).toHaveAttribute('aria-valuenow', '1');

    fireEvent.keyDown(surface(), { key: 'ArrowRight', shiftKey: true });

    expect(surface()).toHaveAttribute('aria-valuenow', '3');
  });

  it('applies every key in a batch, not just the first', () => {
    // A held-down arrow delivers several events in one React batch. Computing
    // from the render closure would make them all step off the same index and
    // land one day away instead of three.
    renderLayer();
    fireEvent.focus(surface());

    // Dispatched inside one act() so React really does batch them; fireEvent
    // flushes after each call and would pass either way.
    const target = surface();
    act(() => {
      for (let i = 0; i < 3; i += 1) {
        target.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
        );
      }
    });

    expect(surface()).toHaveAttribute('aria-valuenow', '3');
  });

  it('leaves the readout alone for keys it does not own', () => {
    renderLayer();

    fireEvent.focus(surface());
    fireEvent.keyDown(surface(), { key: 'a' });

    expect(surface()).toHaveAttribute('aria-valuenow', '0');
  });

  it('draws one marker per event and hides the layer from assistive tech', () => {
    const { container } = renderLayer(MARKERS);

    const markers = container.querySelectorAll('.chart-event-marker');
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute('data-action', 'rotate');
    expect(markers[0]).toHaveAttribute('data-asset', 'ETH');
    expect(markers[1]).toHaveAttribute('data-action', 'sell');
    // The crosshair carries the readout, so markers are not a second tab stop.
    expect(container.querySelector('.chart-event-layer')).toHaveAttribute(
      'aria-hidden',
    );
  });
});
