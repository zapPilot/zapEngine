/**
 * Drawdown Chart Component
 *
 * Shows underwater/drawdown analysis with recovery visualization
 */

import { memo, useMemo } from 'react';

// Shared chart imports are now loaded from ChartUI to prevent duplication
import type { DrawdownHoverData } from '@/types/ui/chartHover';
import { formatChartDate } from '@/utils/formatters';

import {
  buildPath,
  CHART_GRID_POSITIONS,
  ChartGridLines,
  ChartIndicator,
  ChartSurface,
  ChartTooltip,
  useChartHover,
  YAxisLabels,
} from './ChartUI';

/**
 * Drawdown chart data point
 */
interface DrawdownChartDataPoint {
  x: number;
  value: number;
  date: string;
}

/**
 * Drawdown Chart Props
 */
interface DrawdownChartProps {
  chartData: DrawdownChartDataPoint[];
  maxDrawdown: number;
  width?: number;
  height?: number;
}

/**
 * Underwater/Drawdown Chart
 *
 * Shows how deep drawdowns go and recovery speed with:
 * - Red filled area below zero line
 * - Interactive hover tooltips
 * - Max drawdown annotation
 * - Y-axis percentage labels
 */
export const DrawdownChart = memo<DrawdownChartProps>(
  ({ chartData, maxDrawdown, width = 800, height = 200 }) => {
    const data = chartData;

    // Calculate min/max for Y-axis scaling
    const minValue = useMemo(
      () => Math.min(...data.map((d) => d.value), 0),
      [data],
    );
    const maxValue = 0; // Zero line at top

    // Chart hover with tooltip
    const drawdownHover = useChartHover(data, {
      chartType: 'drawdown-recovery',
      chartWidth: width,
      chartHeight: height,
      chartPadding: 0,
      minValue,
      maxValue,
      getYValue: (point) => point.value,
      buildHoverData: (point, x, y): DrawdownHoverData => ({
        chartType: 'drawdown-recovery',
        x,
        y,
        date: formatChartDate(point.date),
        drawdown: point.value,
      }),
    });

    // Normalize drawdown values to SVG coordinates
    // 0% drawdown = y:0 (top), maxDrawdown = y:height (bottom)
    const drawdownScale = Math.abs(minValue) || 15; // Use actual min or fallback to 15%
    const points = buildPath(
      data,
      width,
      (point) => (Math.abs(point.value) / drawdownScale) * height,
    );

    return (
      <div className="relative w-full h-40 overflow-hidden rounded-xl bg-gray-900/30 border border-gray-800 cursor-pointer hover:bg-gray-900/40 hover:border-gray-700/80 transition-all duration-200 group">
        {/* Grid Lines */}
        <ChartGridLines positions={CHART_GRID_POSITIONS.FOUR_LINES} />

        {/* Zero Line (at top) */}
        <div className="absolute top-0 w-full h-px bg-gray-600" />

        <ChartSurface width={width} height={height} handlers={drawdownHover}>
          <defs>
            <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Drawdown Area */}
          <path
            d={`M 0,0 L ${points} L ${width},0 Z`}
            fill="url(#drawdownGradient)"
          />

          {/* Drawdown Line */}
          <path
            d={`M ${points}`}
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />

          {/* Hover indicator */}
          <ChartIndicator hoveredPoint={drawdownHover.hoveredPoint} />
        </ChartSurface>

        {/* Y-Axis Labels */}
        <YAxisLabels labels={['0%', '-5%', '-10%', '-15%']} />

        {/* Legend */}
        <div className="absolute top-2 right-2 flex gap-2 text-[10px] pointer-events-none">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-red-500 rounded" />
            <span className="text-gray-400">Drawdown</span>
          </div>
        </div>

        {/* Max Drawdown Annotation */}
        <div className="absolute left-[56%] top-[85%] transform -translate-x-1/2 pointer-events-none">
          <div className="text-[10px] text-red-400 font-bold whitespace-nowrap">
            {maxDrawdown.toFixed(1)}% Max
          </div>
        </div>

        {/* Tooltip */}
        <ChartTooltip
          hoveredPoint={drawdownHover.hoveredPoint}
          chartWidth={width}
          chartHeight={height}
        />
      </div>
    );
  },
);

DrawdownChart.displayName = 'DrawdownChart';
