export interface FunnelRow {
  label: string;
  value: string;
  /** Absolute share of the top-of-funnel row, 0–1 — bars are relative to this. */
  share: number;
  /** The north-star row, rendered in accent. */
  star?: boolean;
}

/** Bars relative to the first row; each row's conversion is against the row before it. */
export function Funnel(props: { rows: FunnelRow[] }) {
  const top = props.rows[0]?.share || 1;
  return (
    <div className="funnel">
      {props.rows.map((row, index) => {
        const previous = props.rows[index - 1];
        const conversion =
          index > 0 && previous && previous.share > 0
            ? `${Math.round((row.share / previous.share) * 100)}%`
            : '';
        return (
          <div className="funnel-row" key={row.label}>
            <span className={`funnel-label${row.star ? ' accent' : ''}`}>
              {row.label}
            </span>
            <span className="funnel-track">
              <i
                className={row.star ? 'accent' : ''}
                style={{ width: `${Math.min(100, (row.share / top) * 100)}%` }}
              />
            </span>
            <strong className="funnel-value">{row.value}</strong>
            <span className="funnel-conv">{conversion}</span>
          </div>
        );
      })}
    </div>
  );
}
