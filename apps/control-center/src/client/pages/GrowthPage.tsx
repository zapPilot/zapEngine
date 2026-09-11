import { Lightbulb, TrendingDown, UserPlus, Video } from 'lucide-react';

import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import type {
  SocialGrowthResponse,
  SocialPerformanceResponse,
} from '../../shared/types.js';
import { GrowthJourneyPanel } from '../components/GrowthJourneyPanel.js';
import { Card } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ProviderLink } from '../components/ui/Links.js';
import { Pill } from '../components/ui/Pill.js';
import { RankedList, type RankedItem } from '../components/ui/RankedList.js';
import { ShareDonut, type ShareSlice } from '../components/ui/ShareDonut.js';
import { Stat } from '../components/ui/Stat.js';
import { platformColorVar, type Tone } from '../components/ui/tone.js';
import { integer, percent } from '../format.js';
import { PlatformIdentity, platformLabel } from '../platform.js';

const CONFIDENCE_TONE: Record<string, Tone> = {
  high: 'success',
  low: 'neutral',
  medium: 'warning',
};

export const CURRENT_RELEASE_SLOTS_JST = ['09:30', '12:00', '16:00'] as const;

export function GrowthPage(props: {
  data: SocialPerformanceResponse | null;
  growth: SocialGrowthResponse | null;
  journey: SocialGrowthJourney | null;
  onWindowChange: (
    window: SocialPerformanceResponse['window'],
  ) => Promise<void>;
}) {
  return (
    <div className="cc-stack">
      <div className="growth-toolbar">
        <WindowPicker
          active={props.data?.window ?? 'latest'}
          onChange={props.onWindowChange}
        />
      </div>

      <GrowthJourneyPanel growth={props.growth} />

      <PublishingCadence />

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

      <div className="cc-grid rel-main">
        <Card
          icon={Video}
          subtitle="Most recent release, per platform"
          title="本週內容表現"
          tone="info"
        >
          <ContentPerformance data={props.data} />
        </Card>

        <Card
          icon={Lightbulb}
          subtitle="Learned from published posts, not generated advice"
          title="你現在該做什麼"
          tone="accent"
        >
          <RankedList
            empty={
              <EmptyState
                detail="還沒有累積到足以形成建議的樣本。"
                title="No learned guidance yet"
              />
            }
            items={decisionItems(props.data)}
          />
        </Card>
      </div>
    </div>
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
          type="button"
        >
          {window}
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
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
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
        <small>JST · 3 article slots per day</small>
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
        from: journey.appVisitors30d,
        id: 'app-wallet',
        label: 'App 訪客沒有連上錢包',
        to: journey.walletConnectedUsers30d,
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
      .filter((platform) => platform.views === 0)
      .map((platform) => ({
        episode: episode.title,
        platform: platform.platform,
      })),
  );
  if (silent.length > 0) {
    items.push({
      detail: silent
        .map((entry) => `${platformLabel(entry.platform)}／${entry.episode}`)
        .slice(0, 3)
        .join('、'),
      id: 'zero-view-posts',
      title: `${integer(silent.length)} 篇貼文的觀看數是 0`,
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
  const episodes = props.data?.episodes ?? [];
  if (episodes.length === 0) {
    return (
      <EmptyState detail="這個視窗內沒有發佈紀錄。" title="No release yet" />
    );
  }
  return (
    <div className="growth-content">
      {episodes.slice(0, 3).map((episode) => (
        <div className="growth-content-block" key={episode.episodeId}>
          <strong className="growth-content-title">{episode.title}</strong>
          {episode.platforms.map((platform) => (
            <div className="growth-content-row" key={platform.platform}>
              <PlatformIdentity platform={platform.platform} />
              <span className="growth-content-metric">
                {platform.views === null
                  ? '—'
                  : `${integer(platform.views)} views`}
              </span>
              <span className="growth-content-metric">
                {platform.engagementRate === null
                  ? '—'
                  : percent(platform.engagementRate)}
              </span>
              <ProviderLink
                label="查看"
                title={`${episode.title} on ${platform.platform}`}
                url={platform.postUrl}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The learner's per-platform guidance. `confidence` is sample coverage, not
 * statistical significance, so it is shown as-is rather than as an impact score. */
function decisionItems(data: SocialPerformanceResponse | null): RankedItem[] {
  return (data?.decisions ?? [])
    .filter((decision) => decision.evidenceSamples > 0)
    .map((decision) => ({
      aside: (
        <Pill tone={CONFIDENCE_TONE[decision.confidence] ?? 'neutral'}>
          {decision.confidence}
        </Pill>
      ),
      detail: [
        decision.bestTopic ? `最佳題材：${decision.bestTopic}` : null,
        decision.publishSlotsJst
          ? `發佈時段：${decision.publishSlotsJst}`
          : null,
        decision.preferredHookTypes.length > 0
          ? `開場：${decision.preferredHookTypes.join('、')}`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      id: `decision-${decision.platform}`,
      meta: `${integer(decision.evidenceSamples)} samples`,
      title: platformLabel(decision.platform),
      tone: 'accent',
    }));
}
