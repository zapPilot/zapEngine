import { headlineScale } from '../format.js';

/**
 * One column of the Home KPI band: a headline figure plus the figures that
 * qualify it. Grouping by concern rather than showing six equal tiles is what
 * stops "monthly active users" and "projected spend" from competing for the
 * same glance.
 */
export function KpiGroup(props: {
  caption: string;
  label: string;
  secondary?: string[];
  tone?: 'accent' | 'warning';
  value: string;
}) {
  return (
    <section className="kpi-group">
      <span className="kpi-label">{props.label}</span>
      <strong
        className={`kpi-value ${props.tone ?? ''} ${headlineScale(props.value)}`}
      >
        {props.value}
      </strong>
      <span className="kpi-caption">{props.caption}</span>
      {props.secondary?.length ? (
        <div className="kpi-secondary">
          {props.secondary.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
