'use client';

import type { TrackRecordSource } from '@/data/track-record-source';
import styles from './TrackRecordSourceToggle.module.css';

interface TrackRecordSourceToggleProps {
  source: TrackRecordSource;
  onChange: (source: TrackRecordSource) => void;
}

/** The header row that holds the toggle and the source badge beside it. */
export function TrackRecordSourceControls({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={styles['controls']}>{children}</div>;
}

export function TrackRecordSourceToggle({
  source,
  onChange,
}: TrackRecordSourceToggleProps) {
  return (
    <div
      className={styles['toggle']}
      role="group"
      aria-label="Track record source"
    >
      <button
        type="button"
        className={styles['option']}
        data-active={source === 'backtest'}
        aria-pressed={source === 'backtest'}
        onClick={() => onChange('backtest')}
      >
        Backtest
      </button>
      <button
        type="button"
        className={styles['option']}
        data-active={source === 'live'}
        aria-pressed={source === 'live'}
        onClick={() => onChange('live')}
      >
        Live
      </button>
    </div>
  );
}
