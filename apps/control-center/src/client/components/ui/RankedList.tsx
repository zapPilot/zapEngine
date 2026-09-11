import type { ReactNode } from 'react';

import { toneClass, type Tone } from './tone.js';

export interface RankedItem {
  aside?: ReactNode;
  detail?: string | null;
  id: string;
  meta?: ReactNode;
  title: string;
  tone?: Tone;
}

/**
 * A numbered list of things competing for the operator's attention.
 *
 * The rank number is presentational — it says "this one first", not "this
 * scored 86". Priority scores stay off the surface; an operator acts on the
 * order, and a visible score invites arguing with the arithmetic.
 */
export function RankedList(props: { empty: ReactNode; items: RankedItem[] }) {
  if (props.items.length === 0) {
    return <>{props.empty}</>;
  }
  return (
    <ol className="cc-list">
      {props.items.map((item, index) => (
        <li className={`cc-list-item ${toneClass(item.tone)}`} key={item.id}>
          <em className="cc-rank">{index + 1}</em>
          <div>
            <span className="cc-list-title">{item.title}</span>
            {item.detail ? (
              <span className="cc-list-detail">{item.detail}</span>
            ) : null}
            {item.meta ? (
              <span className="cc-list-meta">{item.meta}</span>
            ) : null}
          </div>
          <div className="cc-list-aside">{item.aside}</div>
        </li>
      ))}
    </ol>
  );
}
