import { toneClass, type Tone } from './tone.js';

export interface MiniBar {
  id: string;
  label: string;
  value: number | null;
}

/**
 * A short run of recent readings — daily spend, the last few workflow runs.
 *
 * A `null` reading draws a flat grey stub rather than nothing, so a gap in
 * collection stays visible as a gap instead of silently shortening the series.
 */
export function MiniBars(props: {
  ariaLabel: string;
  bars: MiniBar[];
  tone?: Tone;
}) {
  const values = props.bars
    .map((bar) => bar.value)
    .filter((value): value is number => value !== null);
  const max = Math.max(...values, 0);
  return (
    <div
      aria-label={props.ariaLabel}
      className={`cc-bars ${toneClass(props.tone ?? 'accent')}`}
      role="img"
    >
      {props.bars.map((bar) => (
        <span
          data-empty={bar.value === null ? 'true' : undefined}
          key={bar.id}
          style={{ height: barHeight(bar.value, max) }}
          title={`${bar.label}: ${bar.value ?? 'not collected'}`}
        />
      ))}
    </div>
  );
}

function barHeight(value: number | null, max: number): string {
  if (value === null) {
    return '3px';
  }
  if (max <= 0) {
    return '3px';
  }
  return `${Math.max(8, (value / max) * 100)}%`;
}
