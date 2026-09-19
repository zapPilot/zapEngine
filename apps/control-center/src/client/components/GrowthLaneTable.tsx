import type { OperationsGrowthResponse } from '../../shared/growth.js';
import { ProviderLink } from './ui/Links.js';
import { EmptyState } from './ui/EmptyState.js';

export function GrowthLaneTable({
  acquisition,
}: {
  acquisition: OperationsGrowthResponse | null;
}) {
  if (!acquisition) {
    return (
      <EmptyState title="尚未載入" detail="正在讀取逐集來源與轉換資料。" />
    );
  }
  return (
    <>
      {acquisition.lanes.length === 0 ? (
        <EmptyState
          title="尚無逐集漏斗資料"
          detail="帶 first-touch 的到站資料從 landing 部署後開始累積；目前沒有可顯示的貼文或 waitlist 來源。"
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {[
                  '內容',
                  '平台／語言',
                  '發佈',
                  '到站 30d',
                  'Waitlist CTA 30d',
                  'Waitlist 註冊（累計）',
                  'Discord CTA 30d',
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {acquisition.lanes.map((row) => (
                <tr
                  key={JSON.stringify([
                    row.episodeId,
                    row.platform,
                    row.languageCode,
                  ])}
                >
                  <td>
                    <span className="cell-title">
                      {row.title ?? row.episodeId}
                    </span>
                    <ProviderLink
                      label="查看貼文"
                      title={row.title ?? row.episodeId}
                      url={row.postUrl}
                    />
                  </td>
                  <td className="cell-nowrap">
                    {row.platform} / {row.languageCode}
                  </td>
                  <td className="mono cell-nowrap">
                    {row.publishedAt?.slice(0, 10) ?? '—'}
                  </td>
                  {[
                    row.landingVisitors30d,
                    row.ctaUsers30d,
                    row.waitlistSignups,
                    row.discordCtaUsers30d,
                  ].map((value, index) => (
                    <td
                      className={value === null ? 'unknown-cell' : 'mono'}
                      key={index}
                    >
                      {value === null ? '—' : value.toLocaleString('en-US')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="table-footnote">
        PostHog 為過去 30 天不重複人數；Waitlist 為逐 job
        累計，視窗不同，不能直接相除。Discord CTA 是點擊意圖，不是加入人數。—
        表示來源不可用；0 表示已量測但為零。First-touch 到站從 landing
        部署後開始累積。
      </p>
      {Object.entries(acquisition.laneSources)
        .filter(([, source]) => source.status !== 'ok')
        .map(([name, source]) => (
          <p className="table-footnote" key={name}>
            {name}: {source.message}
          </p>
        ))}
    </>
  );
}
