import type {
  ContentPackagingInsight,
  PackagingEpisode,
} from '../../shared/content-packaging.js';
import { Card } from './ui/Card.js';
import { EmptyState } from './ui/EmptyState.js';
import { RankedList } from './ui/RankedList.js';
import { integer, percent } from '../format.js';
import { platformLabel } from '../platform.js';
import styles from './ContentPackagingCard.module.css';
const labels = {
  title_has_number: '標題含數字',
  title_has_question: '標題含問號',
  title_longer_than_median: '標題長於中位數',
};
function rate(value: number | null) {
  return value === null ? '—' : percent(value);
}
function items(episodes: PackagingEpisode[]) {
  return episodes.map((episode) => ({
    id: episode.episodeId,
    title: episode.shownTitle ?? '未記錄顯示標題',
    aside:
      episode.cover.evidence === 'shipped' && episode.cover.thumbnailUrl ? (
        <img
          alt="已發佈封面"
          className={styles['cover']}
          src={episode.cover.thumbnailUrl}
        />
      ) : null,
    meta: `${episode.reachLift.toFixed(1)}× 中位數 · ${integer(episode.views)} views`,
    detail: (
      <>
        {episode.canonicalTitle !== episode.shownTitle &&
          episode.canonicalTitle && (
            <div>Canonical：{episode.canonicalTitle}</div>
          )}
        {episode.confirmations.map((lane) => (
          <div key={`${lane.platform}-${lane.languageCode}`}>
            {platformLabel(lane.platform)} · {lane.languageCode}：
            {lane.reachLift.toFixed(1)}×
          </div>
        ))}
      </>
    ),
  }));
}
export function ContentPackagingCard({
  packaging,
}: {
  packaging: ContentPackagingInsight | null;
}) {
  const primary = packaging?.primaryLane;
  return (
    <Card
      title="內容包裝洞察"
      subtitle="跨平台共用 · title + cover · 觀察到的相關，非因果"
    >
      <div className={styles['content']}>
        {primary && packaging?.status !== 'unavailable' && (
          <p>
            Rednote 24h 已分發 {primary.distributed}／中位數{' '}
            {primary.medianViews === null ? '—' : integer(primary.medianViews)}
            ／最高 {primary.maxViews === null ? '—' : integer(primary.maxViews)}
            ／互動率 {rate(primary.engagementRate)}。<br />
            分發閘門：未分發 {rate(primary.undistributedRatio)}
            ，屬於帳號／平台層級，不歸因於包裝；審核壓制 {
              primary.suppressed
            }{' '}
            已排除。
            <br />
            其他平台各自以 ±7 天中位數標準化後作確認；回看{' '}
            {packaging.lookbackDays} 天。基準不足 {primary.insufficientBaseline}
            。
          </p>
        )}
        {!packaging ? (
          <EmptyState title="Loading" detail="內容包裝資料尚未載入。" />
        ) : packaging.status === 'unavailable' ? (
          <EmptyState
            title="包裝資料無法取得"
            detail={packaging.message ?? ''}
          />
        ) : packaging.status === 'insufficient' ? (
          <EmptyState
            title="包裝樣本不足"
            detail="至少需要 6 集具備同 lane rolling baseline 的已分發樣本。"
          />
        ) : (
          <>
            <h3>表現較好</h3>
            <RankedList empty={null} items={items(packaging.top)} />
            <h3>表現較弱</h3>
            <RankedList empty={null} items={items(packaging.bottom)} />
            <h3>共通特徵</h3>
            {packaging.features.length ? (
              packaging.features.map((feature) => (
                <p key={feature.key}>
                  {labels[feature.key]}
                  {feature.threshold === null
                    ? ''
                    : `（${feature.threshold} 字）`}
                  ：{feature.with.medianReachLift.toFixed(1)}× vs{' '}
                  {feature.without.medianReachLift.toFixed(1)}×（n=
                  {feature.with.n}／{feature.without.n}）· 關聯 lift{' '}
                  {feature.lift.toFixed(1)}× · 互動率{' '}
                  {rate(feature.with.engagementRate)} vs{' '}
                  {rate(feature.without.engagementRate)}
                </p>
              ))
            ) : (
              <EmptyState
                title="特徵樣本不足"
                detail="有特徵與無特徵兩組各需至少 5 集。"
              />
            )}
          </>
        )}
        <p>這是觀察性相關，不是出圈原因；只比較包裝，不得據此推論選題。</p>
      </div>
    </Card>
  );
}
