import { headlineScale } from '../format.js';

export function Metric(props: {
  label: string;
  tone?: 'accent' | 'warning';
  value: string;
}) {
  return (
    <div className="headline-metric">
      <span>{props.label}</span>
      <strong className={`${props.tone ?? ''} ${headlineScale(props.value)}`}>
        {props.value}
      </strong>
    </div>
  );
}
