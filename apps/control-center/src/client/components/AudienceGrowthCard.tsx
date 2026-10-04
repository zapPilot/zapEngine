import type {
  SocialAudienceSeries,
  SocialGrowthResponse,
} from '../../shared/types.js';
import { signedCount } from '../../shared/format.js';
import { integer } from '../format.js';
import { PlatformIdentity } from '../platform.js';
import { Card } from './ui/Card.js';
import { EmptyState } from './ui/EmptyState.js';
import { Stat } from './ui/Stat.js';
import styles from './AudienceGrowthCard.module.css';

function relativeSeries(series: SocialAudienceSeries) {
  const first = series.followersByDay.findIndex((value) => value !== null);
  const baseline =
    series.delta30d !== null && series.followersNow !== null
      ? series.followersNow - series.delta30d
      : series.followersByDay[first];
  return {
    first,
    values: series.followersByDay.map((value) =>
      value === null || baseline === null || baseline === undefined
        ? null
        : value - baseline,
    ),
  };
}

function capturedTime(value: string): string {
  return new Date(Date.parse(value) + 9 * 3_600_000)
    .toISOString()
    .slice(5, 16)
    .replaceAll('-', '/')
    .replace('T', ' ');
}

export function AudienceGrowthCard(props: {
  growth: SocialGrowthResponse | null;
}) {
  const growth = props.growth;
  if (!growth || growth.status !== 'ok') {
    return (
      <Card title="受眾成長 · 30 天">
        <EmptyState
          title="受眾資料無法取得"
          detail={growth?.message ?? '受眾資料尚未載入。'}
        />
      </Card>
    );
  }
  const { days, series } = growth.audience;
  const relative = series.map(relativeSeries);
  const values = relative.flatMap((row) =>
    row.values.filter((value): value is number => value !== null),
  );
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const y = (value: number) =>
    max === min ? 45 : 80 - ((value - min) / (max - min)) * 70;
  return (
    <Card
      title="受眾成長 · 30 天"
      subtitle="分發是否在累積；不是轉換或註冊證據"
    >
      <div className={styles['grid']}>
        {series.map((row, index) => {
          const { first, values: changes } = relative[index]!;
          const firstDay = days[first];
          const segments: string[][] = [];
          let segment: string[] = [];
          changes.forEach((value, day) => {
            if (value === null) {
              if (segment.length) {
                segments.push(segment);
              }
              segment = [];
            } else {
              segment.push(
                `${10 + (day * 280) / Math.max(1, days.length - 1)},${y(value)}`,
              );
            }
          });
          if (segment.length) {
            segments.push(segment);
          }
          return (
            <section key={row.platform} className={styles['platform']}>
              <PlatformIdentity platform={row.platform} />
              <Stat
                label="30 天淨變化"
                value={signedCount(row.delta30d)}
                caption={`7 天 ${signedCount(row.delta7d)}`}
              />
              {row.followersNow === null ? (
                <p>
                  {row.platform === 'youtube'
                    ? '尚無訂閱數快照'
                    : '尚無追蹤者快照'}
                </p>
              ) : (
                <p>
                  目前 {integer(row.followersNow)} · 截至{' '}
                  {capturedTime(row.capturedAt!)}
                </p>
              )}
              {row.delta30d === null && firstDay && (
                <p>
                  自 {firstDay.slice(5).replace('-', '/')} 起{' '}
                  {signedCount(
                    // firstDay proves at least one measured relative value exists.
                    changes.filter((value) => value !== null).at(-1)!,
                  )}
                  ；尚無 30 天歷史
                </p>
              )}
              <svg
                viewBox="0 0 300 90"
                role="img"
                aria-label={`${row.platform} 受眾變化，30 天 ${signedCount(row.delta30d)}，7 天 ${signedCount(row.delta7d)}；缺資料日斷線`}
              >
                <line
                  x1="10"
                  x2="290"
                  y1={y(0)}
                  y2={y(0)}
                  className={styles['zero']}
                />
                {segments.map((points, part) => (
                  <polyline
                    key={part}
                    points={points.join(' ')}
                    className={styles['line']}
                  />
                ))}
                {changes.map((value, day) =>
                  value === null ? null : (
                    <circle
                      key={days[day]}
                      cx={10 + (day * 280) / Math.max(1, days.length - 1)}
                      cy={y(value)}
                      r="2"
                    >
                      <title>
                        {days[day]} · {integer(row.followersByDay[day]!)} ·{' '}
                        {signedCount(value)}
                      </title>
                    </circle>
                  ),
                )}
              </svg>
              {row.platform === 'rednote' && (
                <p>無外連 CTA；以受眾成長判讀分發</p>
              )}
              {row.platform === 'youtube' &&
                row.followersNow !== null &&
                row.followersNow >= 1_000 && <p>API 會捨入到 3 位有效數字</p>}
            </section>
          );
        })}
      </div>
      <p>共用刻度只比較各平台自身的變化，不是平台偏好、轉換或因果證據</p>
    </Card>
  );
}
