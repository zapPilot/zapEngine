import {
  CAPABILITIES,
  STATUS_LABEL,
  capabilityIds,
  type CapabilityRef,
} from '@/config/runtime';

import styles from './StatusBadge.module.css';

/**
 * The only way a page states whether a capability runs today: the label is
 * looked up from `CAPABILITIES`, never written by the caller. Several ids may
 * share one badge only when they share a status.
 */
export function StatusBadge({
  capability,
  qualifier,
}: {
  capability: CapabilityRef;
  qualifier?: string | undefined;
}) {
  const ids = capabilityIds(capability);
  const status = CAPABILITIES[ids[0]!].status;
  if (ids.some((id) => CAPABILITIES[id].status !== status)) {
    throw new Error(
      `Capabilities ${ids.join(', ')} do not share a status; render one badge each.`,
    );
  }

  const badge = (
    <span
      className={styles['badge']}
      data-capability={ids.join(' ')}
      data-status={status}
    >
      {STATUS_LABEL[status]}
    </span>
  );

  if (!qualifier) return badge;
  return (
    <span className={styles['group']}>
      {badge}
      <span className={styles['qualifier']}>{qualifier}</span>
    </span>
  );
}

/** A line of copy led by the badge of the capability it claims, if any. */
export function StatusNote({
  note,
  className,
}: {
  note: {
    readonly text: string;
    readonly capability?: CapabilityRef | undefined;
    readonly qualifier?: string | undefined;
  };
  className?: string | undefined;
}) {
  return (
    <span className={className ?? styles['note']}>
      {note.capability === undefined ? null : (
        <StatusBadge capability={note.capability} qualifier={note.qualifier} />
      )}
      <span>{note.text}</span>
    </span>
  );
}
