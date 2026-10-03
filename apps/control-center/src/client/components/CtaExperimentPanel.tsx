import type { CtaExperimentReading } from '../../shared/cta-experiment.js';
import { Card } from './ui/Card.js';
import { integer } from '../format.js';

export function CtaExperimentPanel({
  reading,
}: {
  reading: CtaExperimentReading | null;
}) {
  return (
    <Card
      title="CTA 實驗"
      subtitle="PostHog → 表單 → 資料庫確認 · 24 小時有序視窗"
    >
      {!reading || reading.status !== 'ok' ? (
        <p>{reading?.message ?? 'CTA 實驗資料尚未載入。'}</p>
      ) : (
        <>
          <p>
            {reading.readiness === 'review_ready'
              ? '已達最低樣本，可 review；尚不能宣稱勝出。'
              : '資料不足，結果未定；先看流失階段與錯誤原因。'}
          </p>
          {reading.message ? <p>{reading.message}</p> : null}
          <div style={{ overflowX: 'auto' }}>
            <table className="cc-table">
              <thead>
                <tr>
                  {[
                    '版本',
                    '曝光',
                    '看到 CTA',
                    '點擊',
                    '開始填表',
                    '嘗試送出',
                    '成功回應',
                    '確認註冊',
                    '錯誤',
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reading.variants.map((row) => (
                  <tr key={row.variant}>
                    <td>
                      {row.variant === 'baseline'
                        ? 'baseline（非隨機實驗）'
                        : row.variant}
                    </td>
                    {[
                      row.exposed,
                      reading.visibilityUnmeasurable > 0 ? null : row.visible,
                      row.clicked,
                      row.started,
                      row.attempted,
                      row.acknowledged,
                      row.confirmed,
                      row.errors,
                    ].map((value, index) => (
                      <td key={index}>
                        {value === null ? '—' : integer(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            等待完整 24 小時：{integer(reading.excludedImmature)} 人 ·
            排除跨版本：{integer(reading.excludedMultipleVariants)}{' '}
            人。成功回應包含重複提交；確認註冊以首次存入的曝光 ID 核對，不讀取
            email。
          </p>
          {reading.failures.length > 0 ? (
            <p>
              錯誤原因：
              {reading.failures
                .map((row) => `${row.reason} ${integer(row.people)} 人`)
                .join(' · ')}
            </p>
          ) : null}
          <details>
            <summary>查看來源與裝置差異</summary>
            {reading.segments.map((row) => (
              <p key={`${row.variant}:${row.source}:${row.device}`}>
                {row.variant} · {row.source} · {row.device}：曝光{' '}
                {integer(row.exposed)}，點擊 {integer(row.clicked)}，確認註冊{' '}
                {row.confirmed === null ? '—' : integer(row.confirmed)}
              </p>
            ))}
            {reading.caveats.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </details>
        </>
      )}
    </Card>
  );
}
