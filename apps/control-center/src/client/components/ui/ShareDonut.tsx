export interface ShareSlice {
  color: string;
  id: string;
  label: string;
  value: number;
}

const SIZE = 128;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Share of a total, as a ring plus a legend.
 *
 * Renders `empty` when nothing has a value. A ring drawn from an all-zero
 * dataset is a full circle of one arbitrary colour, which reads as "one source
 * accounts for everything" — the opposite of the truth.
 */
export function ShareDonut(props: {
  centerLabel: string;
  empty: React.ReactNode;
  slices: ShareSlice[];
  total: number;
}) {
  const present = props.slices.filter((slice) => slice.value > 0);
  if (props.total <= 0 || present.length === 0) {
    return <>{props.empty}</>;
  }
  let offset = 0;
  return (
    <div className="cc-donut">
      <svg
        aria-hidden="true"
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
      >
        {present.map((slice) => {
          const length = (slice.value / props.total) * CIRCUMFERENCE;
          const dash = `${length} ${CIRCUMFERENCE - length}`;
          const element = (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              fill="none"
              key={slice.id}
              r={RADIUS}
              stroke={slice.color}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeWidth={STROKE}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          );
          offset += length;
          return element;
        })}
      </svg>
      <div className="cc-donut-center">
        <strong>{props.total}</strong>
        <span>{props.centerLabel}</span>
      </div>
      <ul className="cc-donut-legend">
        {present.map((slice) => (
          <li key={slice.id}>
            <i aria-hidden="true" style={{ background: slice.color }} />
            <span>{slice.label}</span>
            <em>{Math.round((slice.value / props.total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}
