import { AudienceGrowthCard } from '../components/AudienceGrowthCard.js';
import { MeasuredViews } from '../components/ui/MeasuredViews.js';
import { ContentPackagingCard } from '../components/ContentPackagingCard.js';
import { TrendingDown, UserPlus, Video } from 'lucide-react';

import type { OperationsGrowthResponse } from '../../shared/growth.js';
import { GrowthLaneTable } from '../components/GrowthLaneTable.js';
import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import {
  DEFAULT_SOCIAL_COMPARISON_WINDOW,
  type SocialGrowthResponse,
  type SocialPerformanceResponse,
} from '../../shared/types.js';
import { GrowthJourneyPanel } from '../components/GrowthJourneyPanel.js';
import { Card } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ProviderLink } from '../components/ui/Links.js';
import { RankedList, type RankedItem } from '../components/ui/RankedList.js';
import { ShareDonut, type ShareSlice } from '../components/ui/ShareDonut.js';
import { Stat } from '../components/ui/Stat.js';
import { platformColorVar } from '../components/ui/tone.js';
import { integer, percent } from '../format.js';
import { PlatformIdentity, platformLabel } from '../platform.js';

export const CURRENT_RELEASE_SLOTS_JST = [
  '09:30',
  '12:00',
  '16:00',
  '21:00',
] as const;

export function GrowthPage(props: {
  acquisition: OperationsGrowthResponse | null;
  data: SocialPerformanceResponse | null;
  growth: SocialGrowthResponse | null;
  journey: SocialGrowthJourney | null;
  onWindowChange: (
    window: SocialPerformanceResponse['window'],
  ) => Promise<void>;
}) {
  return (
    <div className="cc-stack">
      <DecisionBrief journey={props.journey} growth={props.growth} />

      <div className="growth-toolbar">
        <span>
          貼文量測視窗：用於 0 觀看判讀與近期內容表現；到站與轉換固定為 30 天
        </span>
        <WindowPicker
          active={props.data?.window ?? DEFAULT_SOCIAL_COMPARISON_WINDOW}
          onChange={props.onWindowChange}
        />
      </div>

      <GrowthJourneyPanel
        growth={props.growth}
        journey={props.journey}
        community={props.acquisition?.community ?? null}
      />

      <details>
        <summary>查看發佈排程</summary>
        <PublishingCadence />
      </details>

      <div className="cc-grid rel-main">
        <Card
          icon={TrendingDown}
          subtitle="Largest observed drop-offs, worst first"
          title="哪裡正在流失"
          tone="danger"
        >
          <RankedList
            empty={
              <EmptyState
                detail="沒有足夠的觀測資料可以指出流失點。"
                title="尚無可指認的流失"
              />
            }
            items={leakItems(props.journey, props.data)}
          />
        </Card>

        <Card
          icon={UserPlus}
          subtitle="Durable rows in Supabase, with their attributed source"
          title="Waitlist 轉換"
          tone="success"
        >
          <WaitlistCard growth={props.growth} />
        </Card>
      </div>

      <details>
        <summary>查看逐集到站與 CTA 明細</summary>
        <Card title="Podcast → Discord 逐集漏斗">
          <GrowthLaneTable acquisition={props.acquisition} />
        </Card>
      </details>

      <AudienceGrowthCard growth={props.growth} />

      <div className="cc-grid rel-main">
        <Card
          icon={Video}
          subtitle="最近 3 集 · 觀看與互動不代表到站或註冊"
          title="近期內容表現"
          tone="info"
        >
          <ContentPerformance data={props.data} />
        </Card>

        <ContentPackagingCard
          packaging={props.acquisition?.packaging ?? null}
        />
      </div>
    </div>
  );
}

function DecisionBrief(props: {
  journey: SocialGrowthJourney | null;
  growth: SocialGrowthResponse | null;
}) {
  const journey = props.journey;
  const waitlist = props.growth?.waitlist;
  if (journey?.status !== 'ok') {
    return (
      <Card title="本次決策">
        <p>到站資料不可用，先恢復量測再比較渠道。</p>
      </Card>
    );
  }
  const sources = [
    ['Threads', journey.landingThreads30d],
    ['X', journey.landingX30d],
    ['YouTube', journey.landingYoutube30d],
    ['Rednote', journey.landingRednote30d],
    ['Direct', journey.landingDirect30d],
    ['Other', journey.landingOther30d],
  ] as const;
  const leader = [...sources].sort((a, b) => b[1] - a[1])[0];
  return (
    <Card title="本次決策" subtitle="過去 30 天 · 到站來源不等於客戶來源">
      <div className="growth-waitlist-stats">
        <Stat label="到站訪客" value={integer(journey.landingVisitors30d)} />
        <Stat label="Waitlist CTA" value={integer(journey.ctaUsers30d)} />
        <Stat
          label="Waitlist 註冊"
          value={waitlist?.status === 'ok' ? integer(waitlist.signups30d) : '—'}
        />
      </div>
      <p>
        {journey.landingVisitors30d > 0 && leader
          ? `${leader[0]} 帶來 ${integer(leader[1])} 位到站訪客（${percent(leader[1] / journey.landingVisitors30d)}）。歸因使用視窗內首次到站的 UTM／referrer。`
          : '尚無到站訪客，暫時無法比較渠道。'}
      </p>
      {sources.reduce((sum, source) => sum + source[1], 0) !==
        journey.landingVisitors30d && (
        <p>來源分組與到站總數尚未完全對齊，來源占比僅供方向判斷。</p>
      )}
      <p>
        {waitlist?.status !== 'ok'
          ? '註冊資料不可用，先恢復資料再評估成效。'
          : waitlist.signups30d === 0 && journey.landingVisitors30d > 0
            ? '優先檢查 Landing → CTA → 表單是否可完成，再測試與貼文內容一致的價值主張；目前沒有註冊證據支持增加發文量。'
            : '比較渠道帶來的註冊結果，再決定下一個內容實驗；觀看數只作包裝參考。'}
      </p>
    </Card>
  );
}

/** The four windows social telemetry actually supports. There is deliberately
 * no 90-day option: nothing collects one. */
function WindowPicker(props: {
  active: SocialPerformanceResponse['window'];
  onChange: (window: SocialPerformanceResponse['window']) => Promise<void>;
}) {
  const windows: SocialPerformanceResponse['window'][] = [
    'latest',
    '24h',
    '72h',
    '7d',
  ];
  return (
    <div aria-label="Growth window" className="window-picker">
      {windows.map((window) => (
        <button
          aria-pressed={props.active === window}
          className={props.active === window ? 'active' : undefined}
          key={window}
          onClick={() => void props.onChange(window)}
          title={
            window === 'latest'
              ? '每篇最新一筆，量測時間各不相同，不能直接比較'
              : undefined
          }
          type="button"
        >
          {window === 'latest' ? '最新快照' : window}
        </button>
      ))}
    </div>
  );
}

/**
 * Canonical publishing cadence. One article consumes one release slot and all
 * active platform x language lanes share it; the slots here must match
 * SOCIAL_RELEASE_SLOTS in apps/podcast-pipeline/src/social/policy.ts.
 */
function PublishingCadence() {
  return (
    <section className="publishing-brief" aria-label="Next publishing plan">
      <div className="brief-kicker">Next publishing</div>
      <div className="brief-primary">
        <span>Shared release cadence</span>
        <div
          aria-label="Publishing slots"
          style={{
            display: 'grid',
            gap: '8px',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          }}
        >
          {CURRENT_RELEASE_SLOTS_JST.map((slot) => (
            <strong
              key={slot}
              style={{
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-control)',
                padding: '10px 8px',
                textAlign: 'center',
              }}
            >
              {slot}
            </strong>
          ))}
        </div>
        <small>JST · 4 article slots per day</small>
      </div>
      <div className="brief-direction">
        <span>Publishing contract</span>
        <strong>1 article → every active platform</strong>
        <p>
          X · Threads · Rednote · YouTube publish together. Language allocation
          is the only lane-level variation.
        </p>
      </div>
    </section>
  );
}

/**
 * Where the journey loses the most people, plus lanes that published but were
 * never seen. Both are read off observed counts; neither is a prediction.
 */
function leakItems(
  journey: SocialGrowthJourney | null,
  data: SocialPerformanceResponse | null,
): RankedItem[] {
  const items: RankedItem[] = [];
  if (journey?.status === 'ok') {
    const steps = [
      {
        from: journey.landingVisitors30d,
        id: 'landing-cta',
        label: '到站訪客沒有點擊 Waitlist CTA',
        to: journey.ctaUsers30d,
      },
      {
        from: journey.landingVisitors30d,
        id: 'landing-discord',
        label: '到站訪客沒有點擊 Discord CTA',
        to: journey.discordCtaUsers30d,
      },
    ];
    for (const step of steps) {
      if (step.from <= 0) {
        continue;
      }
      const lost = step.from - step.to;
      items.push({
        detail: `${integer(step.from)} 人之中有 ${integer(lost)} 人沒有往下走（過去 30 天，PostHog 不重複人數）。`,
        id: step.id,
        title: step.label,
        tone: 'danger',
      });
    }
  }
  const silent = (data?.episodes ?? []).flatMap((episode) =>
    episode.platforms
      .filter(
        (platform) =>
          platform.views === 0 &&
          platform.measurementWindow !== null &&
          ['24h', '72h', '7d'].includes(platform.measurementWindow),
      )
      .map((platform) => ({
        episode: episode.title,
        platform: platform.platform,
      })),
  );
  if (silent.length > 0) {
    items.push({
      detail:
        (data?.window === 'latest' ? '只計 ≥24h 的列。' : '') +
        silent
          .map((entry) => `${platformLabel(entry.platform)}／${entry.episode}`)
          .slice(0, 3)
          .join('、'),
      id: 'zero-view-posts',
      title: `${integer(silent.length)} 篇貼文的 ${data?.window === 'latest' ? '≥24h 最新快照' : data?.window} 觀看數是 0`,
      tone: 'warning',
    });
  }
  return items.sort((left, right) => toneRank(right) - toneRank(left));
}

function toneRank(item: RankedItem): number {
  return item.tone === 'danger' ? 1 : 0;
}

function WaitlistCard(props: { growth: SocialGrowthResponse | null }) {
  const waitlist = props.growth?.waitlist;
  if (!waitlist) {
    return <EmptyState detail="Waitlist 資料尚未載入。" title="Loading" />;
  }
  if (waitlist.status !== 'ok') {
    return <EmptyState detail={waitlist.message} title="Waitlist 無法取得" />;
  }
  const byPlatform = new Map<string, number>();
  for (const row of waitlist.conversions) {
    byPlatform.set(
      row.platform,
      (byPlatform.get(row.platform) ?? 0) + row.signups,
    );
  }
  const slices: ShareSlice[] = [...byPlatform.entries()].map(
    ([platform, signups]) => ({
      color: platformColorVar(platform),
      id: platform,
      label: platformLabel(platform),
      value: signups,
    }),
  );
  if (waitlist.directOrUnknown7d > 0) {
    slices.push({
      color: 'var(--ink-faint)',
      id: 'direct',
      label: 'Direct / unknown',
      value: waitlist.directOrUnknown7d,
    });
  }
  return (
    <div className="cc-stack">
      <div className="growth-waitlist-stats">
        <Stat label="Total signups" value={integer(waitlist.total)} />
        <Stat label="New · 7d" value={integer(waitlist.signups7d)} />
        <Stat label="New · 30d" value={integer(waitlist.signups30d)} />
      </div>
      <ShareDonut
        centerLabel="attributed"
        empty={
          <EmptyState
            detail={`目前 ${integer(waitlist.total)} 筆註冊，還沒有可歸因的來源分佈。`}
            title="尚無來源分佈"
          />
        }
        slices={slices}
        total={slices.reduce((sum, slice) => sum + slice.value, 0)}
      />
    </div>
  );
}

function ContentPerformance(props: { data: SocialPerformanceResponse | null }) {
  const all = props.data?.episodes ?? [];
  const latest = props.data?.window === 'latest';
  const episodes = latest
    ? all
    : all.filter((episode) => episode.windowReached);
  const skipped = all.length - episodes.length;
  if (episodes.length === 0) {
    return (
      <EmptyState
        detail={
          skipped > 0
            ? `較新的 ${skipped} 集尚未滿 ${props.data?.window}，暫不列入比較`
            : '這個視窗內尚無已滿量測視窗的發佈紀錄。'
        }
        title="No release yet"
      />
    );
  }
  return (
    <div className="growth-content">
      {skipped > 0 && (
        <p>
          較新的 {skipped} 集尚未滿 {props.data?.window}，暫不列入比較
        </p>
      )}
      {episodes.slice(0, 3).map((episode) => (
        <div className="growth-content-block" key={episode.episodeId}>
          <strong className="growth-content-title">{episode.title}</strong>
          {episode.platforms.map((platform) => (
            <div className="growth-content-row" key={platform.platform}>
              <PlatformIdentity platform={platform.platform} />
              <MeasuredViews
                className="growth-content-metric"
                metric={platform}
                missing={latest ? '尚無快照' : '未取得'}
                suffix=" views"
              />
              <span className="growth-content-metric">
                {platform.engagementRate === null
                  ? '—'
                  : percent(platform.engagementRate)}
              </span>
              {platform.postUrl ? (
                <ProviderLink
                  label="查看"
                  title={`${episode.title} on ${platform.platform}`}
                  url={platform.postUrl}
                />
              ) : (
                <span className="growth-content-metric">貼文連結未取得</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
