interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Unique gradient id when several sparklines share a page. */
  gradientId?: string;
}

/**
 * Hand-rolled SVG sparkline (gold line + soft area fill), matching the design.
 * Values are plotted so larger = higher on screen.
 */
export function Sparkline({
  data,
  width = 320,
  height = 54,
  gradientId = 'zp-spark',
}: SparklineProps) {
  if (data.length < 2) {
    return null;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pad = 4;

  const points = data.map((value, index) => {
    const x = index * stepX;
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point}`)
    .join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(212,197,163,.38)" />
          <stop offset="1" stopColor="rgba(212,197,163,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="#d4c5a3"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
