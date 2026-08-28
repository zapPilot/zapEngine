export function Metric(props: {
  accent?: 'actual' | 'projected';
  label: string;
  value: string;
}) {
  return (
    <div className="headline-metric">
      <span>{props.label}</span>
      <strong className={`mono ${props.accent ?? ''}`}>{props.value}</strong>
    </div>
  );
}
