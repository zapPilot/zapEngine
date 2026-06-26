import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

interface SparklineProps {
  data: number[];
  height?: number;
  /** Unique gradient id when several sparklines share a page. */
  gradientId?: string;
}

/**
 * Portfolio-value sparkline (gold line + soft area fill), rendered with recharts.
 * The y-domain is pinned to [dataMin, dataMax] and the area baseline to dataMin
 * so the trend uses the full height — matching the POC's minimal, axis-less look.
 */
export function Sparkline({
  data,
  height = 54,
  gradientId = 'zp-spark',
}: SparklineProps) {
  if (data.length < 2) {
    return null;
  }

  const series = data.map((value, index) => ({ index, value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={series}
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(212,197,163,.38)" />
            <stop offset="1" stopColor="rgba(212,197,163,0)" />
          </linearGradient>
        </defs>
        <YAxis hide={true} domain={['dataMin', 'dataMax']} />
        <Area
          type="linear"
          dataKey="value"
          baseValue="dataMin"
          stroke="#d4c5a3"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
