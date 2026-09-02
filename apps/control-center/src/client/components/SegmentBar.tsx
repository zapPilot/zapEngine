export interface SegmentBarSlice {
  label: string;
  /** Share of the whole, 0–1. */
  share: number;
  color: string;
}

/** A stacked share bar with a legend — used for freshness and AUM concentration. */
export function SegmentBar(props: { segments: SegmentBarSlice[] }) {
  return (
    <div>
      <div className="segment-bar">
        {props.segments.map((segment) => (
          <i
            key={segment.label}
            style={{
              width: `${Math.max(0, segment.share) * 100}%`,
              background: segment.color,
            }}
          />
        ))}
      </div>
      <div className="segment-bar-legend">
        {props.segments.map((segment) => (
          <span key={segment.label}>
            <i
              className="segment-bar-dot"
              style={{ background: segment.color }}
            />
            {segment.label}
          </span>
        ))}
      </div>
    </div>
  );
}
