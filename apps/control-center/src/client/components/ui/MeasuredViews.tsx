import type { SocialPlatformPerformance } from '../../../shared/types.js';
import { integer } from '../../format.js';

const HOURS = { '1h': 1, '6h': 6, '24h': 24, '72h': 72, '7d': 168 };

export function MeasuredViews(props: {
  metric:
    | Pick<
        SocialPlatformPerformance,
        'views' | 'measurementWindow' | 'ageHours'
      >
    | undefined;
  missing: string;
  suffix?: string;
  className?: string;
}) {
  const metric = props.metric;
  const window = metric?.measurementWindow;
  const age = metric?.ageHours;
  return (
    <span className={props.className}>
      <span>
        {metric?.views === null || metric?.views === undefined
          ? props.missing
          : `${integer(metric.views)}${props.suffix ?? ''}`}
      </span>
      {window && <small> · {window}</small>}
      {window &&
        age !== null &&
        age !== undefined &&
        age > HOURS[window] + 6 && <small> · 量於 {integer(age)}h</small>}
    </span>
  );
}
