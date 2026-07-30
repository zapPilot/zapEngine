import type { ReactNode } from 'react';
import { height, padding, width, yForValue } from './chartGeometry';

interface ChartAxisProps {
  yTicks: readonly number[];
  domainMin: number;
  domainMax: number;
  startDate: string;
  endDate: string;
  formatYTick?: (tick: number) => ReactNode;
}

export function ChartAxis({
  yTicks,
  domainMin,
  domainMax,
  startDate,
  endDate,
  formatYTick = (tick) => tick,
}: ChartAxisProps) {
  return (
    <>
      {yTicks.map((tick) => (
        <g className="chart-grid-line" key={tick}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={yForValue(tick, domainMin, domainMax)}
            y2={yForValue(tick, domainMin, domainMax)}
          />
          <text
            x={padding.left - 14}
            y={yForValue(tick, domainMin, domainMax) + 4}
          >
            {formatYTick(tick)}
          </text>
        </g>
      ))}

      <line
        className="chart-axis"
        x1={padding.left}
        x2={width - padding.right}
        y1={height - padding.bottom}
        y2={height - padding.bottom}
      />

      <g className="chart-x-labels">
        <text x={padding.left} y={height - 18}>
          {startDate}
        </text>
        <text x={width - padding.right} y={height - 18}>
          {endDate}
        </text>
      </g>
    </>
  );
}
