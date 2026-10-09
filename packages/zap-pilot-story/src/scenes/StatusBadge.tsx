import {
  CAPABILITIES,
  STATUS_LABEL,
  capabilityIds,
  type SharedCapabilityRef,
} from '../facts/capabilities.js';
export function StatusBadge({
  capability,
}: {
  capability: SharedCapabilityRef;
}) {
  const ids = capabilityIds(capability);
  const { status } = CAPABILITIES[ids[0]!];
  return (
    <span
      className="zp-badge"
      data-capability={ids.join(' ')}
      data-status={status}
    >
      <i className="status-glyph" data-status={status} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
