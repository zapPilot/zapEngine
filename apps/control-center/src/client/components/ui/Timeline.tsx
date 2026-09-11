import type { ReactNode } from 'react';

import { toneClass, type Tone } from './tone.js';

export interface TimelineEvent {
  aside?: ReactNode;
  detail?: string | null;
  id: string;
  timeLabel: string;
  title: string;
  tone?: Tone;
}

/** What happened and when, newest first. */
export function Timeline(props: { empty: ReactNode; events: TimelineEvent[] }) {
  if (props.events.length === 0) {
    return <>{props.empty}</>;
  }
  return (
    <ul className="cc-timeline">
      {props.events.map((event) => (
        <li
          className={`cc-timeline-item ${toneClass(event.tone)}`}
          key={event.id}
        >
          <i aria-hidden="true" className="cc-timeline-dot" />
          <div>
            <span className="cc-list-title">{event.title}</span>
            {event.detail ? (
              <span className="cc-list-detail">{event.detail}</span>
            ) : null}
            <span className="cc-list-meta">{event.timeLabel}</span>
          </div>
          <div className="cc-list-aside">{event.aside}</div>
        </li>
      ))}
    </ul>
  );
}
