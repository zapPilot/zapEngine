import { StatusBadge } from '@/components/StatusBadge';
import {
  CAPABILITIES,
  CAPABILITY_STATUSES,
  STATUS_DEFINITION,
  STATUS_LABEL,
  capabilitiesByStatus,
} from '@zapengine/zap-pilot-story/facts';

const cell = { padding: '10px 12px', verticalAlign: 'top' } as const;

/**
 * Docs view of `CAPABILITIES`: every capability with its status and what it
 * means today, grouped by status, plus the definition of each status.
 */
export function CapabilityStatusTable() {
  return (
    <div className="not-prose my-6">
      <ul style={{ display: 'grid', gap: 8, margin: '0 0 16px', padding: 0 }}>
        {CAPABILITY_STATUSES.map((status) => (
          <li
            key={status}
            style={{ display: 'flex', gap: 10, listStyle: 'none' }}
          >
            <strong style={{ minWidth: 112 }}>{STATUS_LABEL[status]}</strong>
            <span>{STATUS_DEFINITION[status]}</span>
          </li>
        ))}
      </ul>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th style={cell}>Capability</th>
            <th style={cell}>Status</th>
            <th style={cell}>What it means today</th>
          </tr>
        </thead>
        <tbody>
          {CAPABILITY_STATUSES.flatMap((status) =>
            capabilitiesByStatus(status).map((id) => (
              <tr
                key={id}
                style={{ borderTop: '1px solid var(--color-fd-border)' }}
              >
                <td style={cell}>{CAPABILITIES[id].label}</td>
                <td style={cell}>
                  <StatusBadge capability={id} />
                </td>
                <td style={cell}>{CAPABILITIES[id].detail}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
