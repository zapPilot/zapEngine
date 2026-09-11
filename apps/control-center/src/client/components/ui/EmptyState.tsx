import type { LucideIcon } from 'lucide-react';

/**
 * What a card shows when it has nothing to show.
 *
 * `detail` is required rather than optional because an empty panel on this
 * dashboard is ambiguous in a way that matters: "no episode is stuck" and "the
 * queue could not be read" look identical, and only one of them is good news.
 */
export function EmptyState(props: {
  detail: string;
  icon?: LucideIcon;
  title: string;
}) {
  const Icon = props.icon;
  return (
    <div className="cc-empty">
      {Icon ? <Icon aria-hidden="true" /> : null}
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
    </div>
  );
}
