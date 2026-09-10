import { useEffect, useState } from 'react';
import { opsAuditSchema, type OpsAudit } from '@zapengine/types/shared';
import { getJson } from '../api.js';

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
    <section className="panel operator-audit">
      <h2>自動維運紀錄</h2>
      {error ? (
        <p role="status">稽核資料暫時無法取得，修復與驗證狀態未知。</p>
      ) : rows.length === 0 ? (
        <p>尚無維運紀錄。</p>
      ) : (
        rows.map((row) => (
          <article key={row.id}>
            <h3>{row.fingerprint}</h3>
            <p>
              {row.state} · {row.actor} · {row.updated_at}
            </p>
            <p>{row.decision}</p>
            <details>
              <summary>Evidence／授權與動作</summary>
              <pre>
                {JSON.stringify(
                  {
                    evidence: row.evidence,
                    actions: row.actions,
                    verification: row.verification,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </article>
        ))
      )}
    </section>
  );
}
