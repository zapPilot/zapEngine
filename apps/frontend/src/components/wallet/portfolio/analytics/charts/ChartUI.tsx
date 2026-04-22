/**
 * Reusable Chart UI Components
 *
 * Grid lines, labels, and other chart decorations
 */

import type { ReactElement, ReactNode } from 'react';

interface ChartGridLinesProps {
  positions: number[];
}

export function ChartGridLines({
  positions,
}: ChartGridLinesProps): ReactElement {
  return (
    <div className="absolute inset-0">
      {positions.map((y) => (
        <div
          key={y}
          className="absolute w-full h-px bg-gray-800/40"
          style={{ top: `${y}%` }}
        />
      ))}
    </div>
  );
}

interface YAxisLabelsProps {
  labels: string[];
  alignment?: 'left' | 'right';
}

export function YAxisLabels({
  labels,
  alignment = 'right',
}: YAxisLabelsProps): ReactElement {
  return (
    <div
      className={`absolute ${alignment === 'right' ? 'right-2' : 'left-2'} top-0 h-full flex flex-col justify-between py-1 text-[10px] text-gray-600 font-mono text-${alignment}`}
    >
      {labels.map((label, idx) => (
        <span key={idx}>{label}</span>
      ))}
    </div>
  );
}

/**
 * Chart hover handlers interface
 */
interface ChartHoverHandlers {
  handleMouseMove: (event: React.MouseEvent<SVGSVGElement>) => void;
  handleMouseLeave: (event?: React.MouseEvent<SVGSVGElement>) => void;
  handlePointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  handlePointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
  handleTouchMove: (event: React.TouchEvent<SVGSVGElement>) => void;
  handleTouchEnd: (event?: React.TouchEvent<SVGSVGElement>) => void;
}

interface ChartSurfaceProps {
  width: number;
  height: number;
  handlers: ChartHoverHandlers;
  children: ReactNode;
}

export function ChartSurface({
  width,
  height,
  handlers,
  children,
}: ChartSurfaceProps): ReactElement {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      onMouseMove={handlers.handleMouseMove}
      onMouseLeave={handlers.handleMouseLeave}
      onPointerMove={handlers.handlePointerMove}
      onPointerDown={handlers.handlePointerDown}
      onTouchMove={handlers.handleTouchMove}
      onTouchEnd={handlers.handleTouchEnd}
      style={{ touchAction: 'none' }}
    >
      {children}
    </svg>
  );
}
// Re-export shared chart dependencies to avoid import duplication
export { ChartIndicator, ChartTooltip } from '@/components/charts';
export { useChartHover } from '@/hooks/ui/useChartHover';
export { buildPath, CHART_GRID_POSITIONS } from '@/lib/ui/chartPrimitives';
