/**
 * A metric's own 30-day history as a plain trend line: grey, with only the
 * last point coloured by the rule's verdict. Pure function of `series` —
 * never draws axes or a target, because no budget/target exists to draw one
 * against. Renders an empty frame while history is still collecting.
 */
export function Sparkline(props: {
  series: readonly number[];
  width?: number;
  height?: number;
  tone?: string;
  className?: string;
}) {
  const width = props.width ?? 132;
  const height = props.height ?? 30;
  const className = props.className ?? 'statement-sparkline';
  if (props.series.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      />
    );
  }

  const pad = 3;
  const min = Math.min(...props.series);
  const max = Math.max(...props.series);
  const range = max - min || 1;
  const points = props.series.map((value, index) => {
    const x = pad + (index * (width - 2 * pad)) / (props.series.length - 1);
    const y = pad + (height - 2 * pad) * (1 - (value - min) / range);
    return [x, y] as const;
  });
  const [lastX, lastY] = points[points.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points
          .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
          .join(' ')}
        fill="none"
        stroke="var(--ink-dim)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={2.5}
        fill={props.tone ?? 'var(--ink-dim)'}
      />
    </svg>
  );
}
