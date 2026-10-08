import {
  CAPABILITIES,
  STATUS_LABEL,
  type CapabilityId,
} from '../facts/capabilities.js';
export function StatusBadge({ capability }: { capability: CapabilityId }) {
  const { status } = CAPABILITIES[capability];
  return (
    <span
      className="zp-badge"
      data-capability={capability}
      data-status={status}
    >
      <i className="status-glyph" data-status={status} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
