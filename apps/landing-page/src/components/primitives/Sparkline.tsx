import { memo } from 'react';

interface SparklineProps {
  data: number[];
  height?: number;
  /** Unique gradient id when several sparklines share a page. */
  gradientId: string;
  /** Draw-in animation (stroke reveal + area fade) for the hero storyboard. */
  animated?: boolean;
}

const VIEWBOX_WIDTH = 300;

/**
 * Portfolio-value sparkline — web port of the app's
 * `apps/app/src/components/charts/Sparkline.tsx` (gold line + soft area
 * fill). Same geometry: y-domain pinned to [min, max], area baseline at the
 * bottom, 4px top margin so the 2px stroke never clips. The gold #d4c5a3 is
 * the design-tokens accent, hardcoded identically to the app implementation.
 *
 * Memoized: hero parents re-render every animation frame during the
 * net-worth count-up, while this component's props stay stable.
 */
export const Sparkline = memo(function Sparkline({
  data,
  height = 54,
  gradientId,
  animated = false,
}: SparklineProps) {
  if (data.length < 2) {
    return null;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  // 4px top margin (as in the app) so the 2px stroke never clips.
  const top = 4;
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * VIEWBOX_WIDTH;
    const y = top + (1 - (value - min) / range) * (height - top);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${points.join(' L')}`;
  const area = `${line} L${VIEWBOX_WIDTH},${height} L0,${height} Z`;

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d4c5a3" stopOpacity={0.38} />
          <stop offset="1" stopColor="#d4c5a3" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        className={animated ? 'sparkline-area draw' : 'sparkline-area'}
        d={area}
        fill={`url(#${gradientId})`}
      />
      <path
        className={animated ? 'sparkline-line draw' : 'sparkline-line'}
        d={line}
        pathLength={1}
        fill="none"
        stroke="#d4c5a3"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
});
