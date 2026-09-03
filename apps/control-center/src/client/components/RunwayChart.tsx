import type { CostSource, CostType } from '@zapengine/cost-observability';
import { type KeyboardEvent, useRef, useState } from 'react';

import type { CostHistoryPoint, OverviewResponse } from '../../shared/types.js';
import {
  costBasisLabel,
  excludedDailyProviders,
  excludedNote,
  excludedProviders,
} from '../cost-basis.js';
import { filterKnownAccruedCost, usd } from '../format.js';

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 260;
const PLOT_LEFT = 72;
const PLOT_RIGHT = 928;
const PLOT_BASELINE = 210;
const PLOT_HEIGHT = 150;
const BAND_TOP = 46;
const BAND_HEIGHT = 176;
const TOOLTIP_ID = 'runway-tooltip';

/**
 * Hit targets run to the viewBox edge rather than to `PLOT_RIGHT`, which gives
 * the month-end target the 72 units of gutter to the right of the plot.
 *
 * The projection sits at `PLOT_RIGHT` and the last daily point walks toward it
 * as the month ends, so between them the midpoint rule alone leaves 228 units
 * mid-month, 14 on the 30th and nothing at all on the 31st — unreachable on
 * the day the month-end figure matters most. Widening it leftwards instead
 * would take the hit area of the very day it projects from. Nothing is drawn
 * in the gutter: the last axis label is right-anchored at `PLOT_RIGHT`, and
 * the bands end at y=222, above the axis row.
 */
const BAND_RIGHT = VIEW_WIDTH;

/**
 * Six lines is what stays scannable while the pointer is moving. Four
 * providers is the whole roster today, so this only ever bites if the roster
 * grows — at which point the overflow collapses into one residual line rather
 * than vanishing, because a breakdown that no longer adds up to the header is
 * the same silent omission this chart exists to end.
 */
const MAX_TOOLTIP_LINES = 6;

interface TooltipLine {
  asOf: string | null;
  basis: string;
  costUsd: number;
  label: string;
}

interface ChartTarget {
  bandWidth: number;
  bandX: number;
  excluded: string | null;
  heading: string;
  id: string;
  lines: TooltipLine[];
  projected: boolean;
  summary: string;
  totalUsd: number;
  x: number;
  y: number;
}

type TargetSeed = Omit<ChartTarget, 'bandWidth' | 'bandX'>;

interface ActiveTooltip {
  flip: boolean;
  left: number;
  target: ChartTarget;
  top: number;
}

export function RunwayChart(props: {
  history: CostHistoryPoint[];
  projected: number | null | undefined;
  providers: OverviewResponse['providers'];
}) {
  const [active, setActive] = useState<ActiveTooltip | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const known = filterKnownAccruedCost(props.history);

  if (known.length === 0) {
    return (
      <section aria-labelledby="runway-title" className="panel runway-panel">
        <div className="panel-head">
          <h2 id="runway-title">Current month cost pace</h2>
        </div>
        <div className="chart-empty">
          Daily snapshots will appear after the first cost sync.
        </div>
      </section>
    );
  }

  const last = known.at(-1)!;
  const now = new Date(`${last.date}T00:00:00.000Z`);
  const days = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const projected = props.projected ?? last.accruedCostUsd;
  const ceiling = Math.max(
    10,
    Math.ceil(
      Math.max(projected, ...known.map((point) => point.accruedCostUsd)) / 20,
    ) * 20,
  );
  const x = (date: string) =>
    PLOT_LEFT +
    ((Number(date.slice(8, 10)) - 1) / Math.max(days - 1, 1)) *
      (PLOT_RIGHT - PLOT_LEFT);
  const y = (value: number) => PLOT_BASELINE - (value / ceiling) * PLOT_HEIGHT;
  const path = known
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${x(point.date)} ${y(point.accruedCostUsd)}`,
    )
    .join(' ');
  const todayX = x(last.date);

  const targets = withBands([
    ...known.map((point) => {
      const lines = sortLines(
        point.providers.flatMap((entry) =>
          entry.accruedCostUsd === null
            ? []
            : [
                tooltipLine({
                  // Each day is dated with its own reading. Taking the date
                  // off the current snapshot instead would restamp every past
                  // day the moment an operator records a new figure.
                  asOf: entry.periodEnd,
                  costType: entry.costType,
                  costUsd: entry.accruedCostUsd,
                  label: entry.label,
                  source: entry.source,
                }),
              ],
        ),
      );
      const excluded = excludedNote(excludedDailyProviders(point.providers));
      const heading = dayLabel(point.date);
      return {
        excluded,
        heading,
        id: point.date,
        lines,
        projected: false,
        summary: summarize(heading, point.accruedCostUsd, lines, excluded),
        totalUsd: point.accruedCostUsd,
        x: x(point.date),
        y: y(point.accruedCostUsd),
      };
    }),
    projectedTarget(props.providers, projected, y(projected)),
  ]);

  function anchor(target: ChartTarget): Omit<ActiveTooltip, 'target'> {
    const svgBox = svgRef.current?.getBoundingClientRect();
    const frameBox = frameRef.current?.getBoundingClientRect();
    if (!svgBox || !frameBox) {
      return { flip: target.projected, left: 0, top: 0 };
    }
    // `preserveAspectRatio: xMidYMid meet` letterboxes the drawing inside the
    // element, so a viewBox coordinate is not a fraction of the element's box
    // — it becomes a pixel offset only after the measured scale and the
    // letterbox gutters are applied.
    const scale = Math.min(
      svgBox.width / VIEW_WIDTH,
      svgBox.height / VIEW_HEIGHT,
    );
    const left =
      svgBox.left -
      frameBox.left +
      (svgBox.width - VIEW_WIDTH * scale) / 2 +
      target.x * scale;
    const top =
      svgBox.top -
      frameBox.top +
      (svgBox.height - VIEW_HEIGHT * scale) / 2 +
      target.y * scale;
    return {
      flip: target.projected || left > frameBox.width / 2,
      left: finite(left),
      top: finite(top),
    };
  }

  function onBandKeyDown(event: KeyboardEvent<SVGRectElement>) {
    if (event.key === 'Escape') {
      setActive(null);
    }
  }

  return (
    <section aria-labelledby="runway-title" className="panel runway-panel">
      <div className="panel-head">
        <h2 id="runway-title">Current month cost pace</h2>
        <div className="chart-legend" aria-hidden="true">
          <span>
            <i className="legend-actual" />
            Persisted daily
          </span>
          <span>
            <i className="legend-projected" />
            Projected
          </span>
        </div>
      </div>
      <div className="runway-chart-frame" ref={frameRef}>
        <svg
          aria-labelledby="runway-title"
          className="runway-chart"
          ref={svgRef}
          role="group"
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((step) => {
            const gridY = PLOT_BASELINE - step * PLOT_HEIGHT;
            return (
              <g key={step}>
                <line
                  className="chart-grid"
                  x1={PLOT_LEFT}
                  x2={PLOT_RIGHT}
                  y1={gridY}
                  y2={gridY}
                />
                <text
                  className="chart-axis"
                  x="58"
                  y={gridY + 4}
                  textAnchor="end"
                >
                  {usd(ceiling * step)}
                </text>
              </g>
            );
          })}
          <path className="actual-line" d={path} />
          <path
            className="projected-line"
            d={`M ${todayX} ${y(last.accruedCostUsd)} L ${PLOT_RIGHT} ${y(projected)}`}
          />
          <circle
            className="actual-point"
            cx={todayX}
            cy={y(last.accruedCostUsd)}
            r="5"
          />
          <circle
            className="projected-point"
            cx={PLOT_RIGHT}
            cy={y(projected)}
            r="5"
          />
          <text className="chart-axis" x={PLOT_LEFT} y="241">
            {monthLabel(now)} 1
          </text>
          <text className="chart-axis" x={PLOT_RIGHT} y="241" textAnchor="end">
            {monthLabel(now)} {days}
          </text>
          {/*
            One band per point, each reaching to its neighbours' midpoints, so
            every horizontal position already resolves to a nearest point and
            no mousemove arithmetic is needed. They are focusable and carry the
            tooltip's text as their name, which is how a keyboard or
            screen-reader reader gets the numbers at all.
          */}
          {targets.map((target) => (
            <rect
              aria-describedby={
                active?.target.id === target.id ? TOOLTIP_ID : undefined
              }
              aria-label={target.summary}
              className="runway-hit"
              height={BAND_HEIGHT}
              key={target.id}
              onBlur={() => setActive(null)}
              onFocus={() => setActive({ ...anchor(target), target })}
              onKeyDown={onBandKeyDown}
              onMouseEnter={() => setActive({ ...anchor(target), target })}
              onMouseLeave={() => setActive(null)}
              tabIndex={0}
              width={target.bandWidth}
              x={target.bandX}
              y={BAND_TOP}
            />
          ))}
        </svg>
        {active ? <RunwayTooltip active={active} /> : null}
      </div>
    </section>
  );
}

function RunwayTooltip({ active }: { active: ActiveTooltip }) {
  const target = active.target;
  return (
    <div
      className="runway-tooltip"
      id={TOOLTIP_ID}
      role="tooltip"
      style={{
        left: `${active.left}px`,
        top: `${active.top}px`,
        transform: active.flip
          ? 'translate(calc(-100% - 14px), -50%)'
          : 'translate(14px, -50%)',
      }}
    >
      <div className="runway-tooltip-head">
        <span>{target.heading}</span>
        <strong className="mono">{usd(target.totalUsd)}</strong>
      </div>
      {target.lines.map((line) => (
        <div className="runway-tooltip-row" key={line.label}>
          <span>{line.label}</span>
          <strong className="mono">{usd(line.costUsd)}</strong>
          <small>
            {line.asOf ? `${line.basis} · as of ${line.asOf}` : line.basis}
          </small>
        </div>
      ))}
      {target.excluded ? (
        <div className="runway-tooltip-excluded">{target.excluded}</div>
      ) : null}
    </div>
  );
}

/**
 * The month-end point is the one target whose breakdown is not a historical
 * row: it is each provider's own projection, so an unpriced provider shows up
 * here as an omission from the figure the KPI band prints.
 */
function projectedTarget(
  providers: OverviewResponse['providers'],
  totalUsd: number,
  pointY: number,
): TargetSeed {
  const lines = sortLines(
    providers.flatMap((provider) => {
      const snapshot = provider.snapshot;
      if (!snapshot || snapshot.projectedCostUsd === null) {
        return [];
      }
      return [
        tooltipLine({
          asOf: snapshot.periodEnd,
          costType: snapshot.costType,
          costUsd: snapshot.projectedCostUsd,
          label: provider.label,
          source: snapshot.source,
        }),
      ];
    }),
  );
  const excluded = excludedNote(excludedProviders(providers));
  const heading = 'Projected month-end';
  return {
    excluded,
    heading,
    id: 'projected',
    lines,
    projected: true,
    summary: summarize(heading, totalUsd, lines, excluded),
    totalUsd,
    x: PLOT_RIGHT,
    y: pointY,
  };
}

function withBands(seeds: TargetSeed[]): ChartTarget[] {
  return seeds.map((seed, index) => {
    const previous = seeds[index - 1];
    const next = seeds[index + 1];
    const left = previous ? (previous.x + seed.x) / 2 : PLOT_LEFT;
    const right = next ? (seed.x + next.x) / 2 : BAND_RIGHT;
    // Seeds arrive in ascending x, which keeps every width non-negative; the
    // clamp is only so unordered history degrades to an unreachable band
    // rather than to a rect the renderer drops as an error.
    return { ...seed, bandWidth: Math.max(right - left, 0), bandX: left };
  });
}

function tooltipLine(input: {
  asOf: string | null;
  costType: CostType;
  costUsd: number;
  label: string;
  source: CostSource;
}): TooltipLine {
  return {
    asOf: input.source === 'manual' && input.asOf ? dayLabel(input.asOf) : null,
    basis: costBasisLabel(input.costType, input.source),
    costUsd: input.costUsd,
    label: input.label,
  };
}

/**
 * Biggest first, and never more than `MAX_TOOLTIP_LINES` of them. Anything the
 * cap cuts is summed into a final line instead of being dropped: the header
 * prints one total, so every amount inside it has to stay visible somewhere in
 * the breakdown for the two to reconcile.
 */
function sortLines(lines: TooltipLine[]): TooltipLine[] {
  const sorted = [...lines].sort((left, right) => right.costUsd - left.costUsd);
  if (sorted.length <= MAX_TOOLTIP_LINES) {
    return sorted;
  }
  const shown = sorted.slice(0, MAX_TOOLTIP_LINES - 1);
  const rest = sorted.slice(MAX_TOOLTIP_LINES - 1);
  return [
    ...shown,
    {
      asOf: null,
      basis: 'Summed to keep the breakdown equal to the total',
      costUsd: rest.reduce((total, line) => total + line.costUsd, 0),
      label: `${rest.length} more providers`,
    },
  ];
}

function summarize(
  heading: string,
  totalUsd: number,
  lines: TooltipLine[],
  excluded: string | null,
): string {
  const parts = [
    `${heading} ${usd(totalUsd)}`,
    ...lines.map(
      (line) =>
        `${line.label} ${usd(line.costUsd)}, ${line.basis}${
          line.asOf ? `, as of ${line.asOf}` : ''
        }`,
    ),
  ];
  if (excluded) {
    parts.push(excluded);
  }
  return parts.join('. ');
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function dayLabel(value: string): string {
  // A date-only ISO string parses as UTC, so a day key from the history and a
  // full snapshot timestamp both land in the same frame as the chart's own
  // UTC month arithmetic.
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}
