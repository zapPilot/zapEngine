'use client';

/**
 * Crosshair, tooltip and event markers for the track-record charts.
 *
 * Everything interactive here is HTML absolutely positioned over the SVG, not
 * SVG children. The chart is `width: 100%; height: auto` on a 720x320 viewBox,
 * so one viewBox unit renders anywhere from ~0.4px to ~1.5px depending on the
 * column it sits in; marker sizes and hit targets specified in px cannot live
 * inside it. Percentages come from chartGeometry, sizes from CSS.
 *
 * The chart's own <svg> is passed through as children and never touched, which
 * is what makes adopting this on the drawdown and benchmark charts a wrapper
 * rather than a copy.
 */
import { useId, useMemo, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import {
  indexFromPointer,
  nextIndexForKey,
  tooltipLeftStyle,
} from './chartHover';
import { plotInsetPercent, pointPercent, xForPoint } from './chartGeometry';
import { MARKER_COLOR, MarkerGlyph } from './chartMarkers';
import type { MarkerAction, MarkerAsset } from './chartMarkers';

export interface ChartReadoutRow {
  readonly id: string;
  readonly label: string;
  /** Preformatted — this layer never does numeric formatting. */
  readonly value: string;
  readonly color: string;
}

export interface ChartMarker {
  readonly index: number;
  /** viewBox y on the series the marker belongs to. */
  readonly y: number;
  readonly asset: MarkerAsset;
  readonly action: MarkerAction;
  /** Human sentence for the readout, e.g. "Rotated BTC into ETH". */
  readonly label: string;
}

export interface ChartAllocationSegment {
  readonly id: string;
  readonly label: string;
  /** Raw portfolio percentage point used for width; filtered sets may sum <100. */
  readonly percent: number;
  /** Preformatted, like every other value here. */
  readonly display: string;
  readonly color: string;
}

export interface ChartAllocationBar {
  /** Omit on a single bar; a pair names itself, e.g. "Before" / "After". */
  readonly label?: string;
  /** Defaults to true. False suppresses the figures, not the bar. */
  readonly showValues?: boolean;
  readonly segments: readonly ChartAllocationSegment[];
}

interface ChartHoverLayerProps {
  readonly total: number;
  readonly labelForIndex: (index: number) => string;
  readonly rowsForIndex: (index: number) => ChartReadoutRow[];
  /** viewBox y of the focus dot on the primary series; omit for no dot. */
  readonly focusYForIndex?: (index: number) => number;
  readonly markers?: readonly ChartMarker[];
  /**
   * Composition of the position at this index — one bar, or two to put a
   * trade's before and after side by side. Omit for charts with no position to
   * show; null for an index whose data cannot say.
   *
   * Structured rather than a render prop because the same data has to become
   * the screen-reader readout, and an opaque node cannot be summarised.
   */
  readonly allocationForIndex?: (
    index: number,
  ) => readonly ChartAllocationBar[] | null;
  readonly ariaLabel: string;
  readonly children: ReactNode;
}

export function ChartHoverLayer({
  total,
  labelForIndex,
  rowsForIndex,
  focusYForIndex,
  markers = [],
  allocationForIndex,
  ariaLabel,
  children,
}: ChartHoverLayerProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const helpId = useId();
  const inset = plotInsetPercent();
  const eventIndices = useMemo(
    () => markers.map((marker) => marker.index),
    [markers],
  );

  function trackPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const next = indexFromPointer(
      event.clientX,
      event.currentTarget.getBoundingClientRect(),
      total,
    );
    if (next >= 0) setActiveIndex(next);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const stroke = { key: event.key, shiftKey: event.shiftKey };
    // Whether the key is ours never depends on the current index, so probing
    // with 0 is safe and keeps the key list in one place. The move itself must
    // be a functional update: a held-down arrow delivers several events in one
    // React batch, and reading activeIndex from the render closure would make
    // every one of them compute from the same stale index.
    if (nextIndexForKey(stroke, 0, total, eventIndices) === null) return;
    event.preventDefault();
    setActiveIndex(
      (previous) =>
        nextIndexForKey(stroke, previous ?? 0, total, eventIndices) ?? previous,
    );
  }

  const rows = activeIndex === null ? [] : rowsForIndex(activeIndex);
  const activeMarker =
    activeIndex === null
      ? undefined
      : markers.find((marker) => marker.index === activeIndex);
  const activeLeft =
    activeIndex === null
      ? '0%'
      : pointPercent(xForPoint(activeIndex, total), 0).left;
  const bars =
    activeIndex === null ? [] : (allocationForIndex?.(activeIndex) ?? []);
  const readout =
    activeIndex === null
      ? ''
      : [
          labelForIndex(activeIndex),
          ...rows.map((row) => `${row.label} ${row.value}`),
          ...(activeMarker ? [activeMarker.label] : []),
          // Every bar's figures, including a bar rendered without them: a
          // sighted reader compares two bars by their shapes, and that is the
          // one comparison a readout cannot carry.
          ...bars.map(
            (bar) =>
              `${bar.label ?? 'Allocation'} ${bar.segments
                .map((segment) => `${segment.label} ${segment.display}`)
                .join(', ')}`,
          ),
        ].join(', ');

  return (
    <div className="chart-hover-shell">
      {children}

      <div className="chart-event-layer" aria-hidden>
        {markers.map((marker) => (
          <span
            key={`${marker.index}-${marker.action}`}
            className="chart-event-marker"
            data-action={marker.action}
            data-asset={marker.asset}
            style={
              {
                ...pointPercent(xForPoint(marker.index, total), marker.y),
                '--marker-color': MARKER_COLOR[marker.asset],
              } as CSSProperties
            }
          >
            <MarkerGlyph action={marker.action} />
          </span>
        ))}
      </div>

      {activeIndex !== null && (
        <>
          <div
            className="chart-crosshair"
            aria-hidden
            style={{ left: activeLeft, top: inset.top, bottom: inset.bottom }}
          />
          {focusYForIndex && (
            <div
              className="chart-focus-dot"
              aria-hidden
              style={pointPercent(
                xForPoint(activeIndex, total),
                focusYForIndex(activeIndex),
              )}
            />
          )}
          <div
            className="chart-tooltip"
            aria-hidden
            style={{ left: tooltipLeftStyle(activeLeft) }}
          >
            <p className="chart-tooltip-date">{labelForIndex(activeIndex)}</p>
            {rows.map((row) => (
              <div className="chart-tooltip-row" key={row.id}>
                <span
                  className="chart-tooltip-key"
                  style={{ '--row-color': row.color } as CSSProperties}
                />
                <strong className="chart-tooltip-value">{row.value}</strong>
                <span className="chart-tooltip-label">{row.label}</span>
              </div>
            ))}
            {activeMarker && (
              <p className="chart-tooltip-event">{activeMarker.label}</p>
            )}
            {bars.length > 0 && (
              <div className="chart-tooltip-alloc-group">
                {bars.map((bar, barIndex) => (
                  <div
                    className="chart-tooltip-alloc"
                    data-labelled={bar.label !== undefined}
                    key={bar.label ?? barIndex}
                  >
                    {bar.label !== undefined && (
                      <span className="chart-tooltip-alloc-label">
                        {bar.label}
                      </span>
                    )}
                    <span className="chart-tooltip-alloc-bar">
                      {bar.segments.map((segment) => (
                        <span
                          key={segment.id}
                          style={{
                            width: `${segment.percent}%`,
                            background: segment.color,
                          }}
                        />
                      ))}
                    </span>
                    {bar.showValues !== false && (
                      <p className="chart-tooltip-alloc-values">
                        {bar.segments
                          .map(
                            (segment) => `${segment.label} ${segment.display}`,
                          )
                          .join('  ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/*
        role="slider" so aria-valuetext is announced on every change: keyboard
        users get the identical readout the tooltip shows, with the arrow-key
        semantics screen readers already expect. It reads as "set a value"
        rather than "inspect one", which is the accepted trade for a chart
        scrubber. Nothing is inside this element — a wrapper that also held the
        tooltip would grow when the tooltip mounts and corrupt the box width
        mid-hover.
      */}
      <div
        className="chart-hover-surface"
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, total - 1)}
        aria-valuenow={activeIndex ?? 0}
        aria-valuetext={readout}
        aria-describedby={helpId}
        style={inset}
        onPointerMove={trackPointer}
        onPointerDown={trackPointer}
        onPointerLeave={() => setActiveIndex(null)}
        onPointerCancel={() => setActiveIndex(null)}
        onFocus={() => setActiveIndex((previous) => previous ?? 0)}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={handleKeyDown}
      />
      <p id={helpId} className="chart-sr-only">
        Arrow keys move one day, shift and arrow jump between rebalances, home
        and end go to the first and last day.
      </p>
    </div>
  );
}
