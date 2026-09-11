import type { CSSProperties, ReactNode } from 'react';

export interface BarRow {
  color?: string;
  id: string;
  label: ReactNode;
  /** Rendered verbatim on the right. Formatting belongs to the caller, which
   * knows whether the number is money, a count or a share. */
  value: string;
  /** Absent means "not collected", which draws no bar at all — a zero-width bar
   * and an unknown one would otherwise look the same. */
  weight: number | null;
}

/** Labelled bars sharing one scale. The scale is the largest weight present,
 * unless the caller passes a `max` that means something (a budget, a total). */
export function BarRows(props: { max?: number; rows: BarRow[] }) {
  const weights = props.rows
    .map((row) => row.weight)
    .filter((weight): weight is number => weight !== null && weight > 0);
  const max = props.max ?? Math.max(...weights, 0);
  return (
    <div>
      {props.rows.map((row) => (
        <div className="cc-bar-row" key={row.id}>
          <span className="cc-bar-label">{row.label}</span>
          <span className="cc-bar-value">{row.value}</span>
          <span className="cc-bar-track cc-track">
            {row.weight !== null && max > 0 ? (
              <i style={segmentStyle(row.weight / max, row.color)} />
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function segmentStyle(share: number, color: string | undefined): CSSProperties {
  return {
    '--cc-seg': color ?? 'var(--cc-tone-accent)',
    width: `${Math.max(0, Math.min(1, share)) * 100}%`,
  } as CSSProperties;
}
