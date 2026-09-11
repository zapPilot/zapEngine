import { History } from 'lucide-react';
import { useEffect, useState } from 'react';

import { opsAuditSchema, type OpsAudit } from '@zapengine/types/shared';
import { getJson } from '../api.js';
import { relativeTime } from '../format.js';
import { Card } from './ui/Card.js';
import { EmptyState } from './ui/EmptyState.js';
import { Timeline, type TimelineEvent } from './ui/Timeline.js';
import type { Tone } from './ui/tone.js';

const STATE_TONE: Record<string, Tone> = {
  observed: 'warning',
  remediated: 'success',
  verified: 'success',
};

export function OperatorAudit({ refreshedAt }: { refreshedAt?: string }) {
  const [rows, setRows] = useState<OpsAudit[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void getJson<unknown>('/api/operations/operator-history')
      .then((data) => {
        const parsed = opsAuditSchema.array().parse(data);
        if (active) {
          setRows(parsed);
          setError(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [refreshedAt]);

  return (
    <Card
      icon={History}
      subtitle="Recorded operator observations, actions and verifications"
      title="最近事件與修復"
      tone="neutral"
    >
      {error ? (
        <p className="operator-audit-error" role="status">
          稽核資料暫時無法取得，修復與驗證狀態未知。
        </p>
      ) : (
        <Timeline
          empty={
            <EmptyState
              detail="operator 迴圈還沒有記錄任何觀察或動作。"
              title="尚無維運紀錄"
            />
          }
          events={rows.map(toEvent)}
        />
      )}
    </Card>
  );
}

function toEvent(row: OpsAudit): TimelineEvent {
  return {
    // The raw evidence stays reachable: it is the only place an operator can
    // see what the loop actually authorised and verified.
    aside: (
      <details className="operator-audit-evidence">
        <summary>Evidence</summary>
        <pre>
          {JSON.stringify(
            {
              actions: row.actions,
              evidence: row.evidence,
              verification: row.verification,
            },
            null,
            2,
          )}
        </pre>
      </details>
    ),
    detail: row.decision,
    id: row.id,
    timeLabel: `${row.state} · ${row.actor} · ${relativeTime(row.updated_at)}`,
    title: row.fingerprint,
    tone: STATE_TONE[row.state] ?? 'neutral',
  };
}
