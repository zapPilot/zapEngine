import type { DeltaTone } from '../../shared/statements.js';
import { DeltaChip } from './DeltaChip.js';
import { Sparkline } from './Sparkline.js';
import { toneColor } from './statement-sentence.js';

/**
 * `KpiGroup` plus the one thing every headline number now carries: its own
 * 30-day sparkline and Δ7d. Used in the Home band and the Growth platform
 * band.
 *
 * `secondary` is what a total that omits something says about the omission.
 * It is the same disclosure `KpiGroup` renders, in the same class, because an
 * exclusion has to read identically on the tile a founder glances at and on
 * the page that explains it.
 */
export function MetricCell(props: {
  label: string;
  value: string;
  tone?: 'accent';
  delta: string;
  deltaTone: DeltaTone;
  series: readonly number[];
  caption: string;
  secondary?: string | null;
}) {
  return (
    <div className="metric-cell">
      <span className="metric-cell-label">{props.label}</span>
      <div className="metric-cell-value-row">
        <strong
          className={`metric-cell-value${props.tone ? ` ${props.tone}` : ''}`}
        >
          {props.value}
        </strong>
        <DeltaChip value={props.delta} tone={props.deltaTone} />
      </div>
      <Sparkline
        series={props.series}
        width={140}
        height={34}
        className="metric-cell-sparkline"
        tone={toneColor(props.deltaTone)}
      />
      <span className="metric-cell-caption">{props.caption}</span>
      {props.secondary ? (
        <div className="kpi-secondary">
          <span>{props.secondary}</span>
        </div>
      ) : null}
    </div>
  );
}
