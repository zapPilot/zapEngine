import {
  Bell,
  CircleDollarSign,
  Clapperboard,
  Layers,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import type {
  PipelineQueuesResponse,
  SocialQueueItem,
} from '../../shared/pipeline-queues.js';
import type {
  OperationalPriority,
  OperationsResponse,
  OverviewResponse,
  PodcastCostResponse,
} from '../../shared/types.js';
import type { DashboardView } from '../components/AppShell.js';
import { Card } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { FlowBand, type FlowStage } from '../components/ui/FlowBand.js';
import { ProviderLink, ViewAllLink } from '../components/ui/Links.js';
import { Pill, StatusPill } from '../components/ui/Pill.js';
import { RankedList } from '../components/ui/RankedList.js';
import { SourceBadge } from '../components/ui/SourceBadge.js';
import { Stat } from '../components/ui/Stat.js';
import { statusTone, type Tone } from '../components/ui/tone.js';
import { integer, percent, relativeTime, usd, usdWhole } from '../format.js';
import { destinationFor, retryWaste, statusText } from '../operator-model.js';
import { priorityItems } from '../priority-items.js';
import { PlatformIdentity } from '../platform.js';
import { QueuePanel } from '../queue-availability.js';

/** Anything older than this is reported as stale rather than as current health:
 * a fifteen-minute-old "healthy" is not evidence that the system is healthy now. */
const STALE_AFTER_MS = 15 * 60_000;

export function TodayPage(props: {
  data: OverviewResponse | null;
  journey: SocialGrowthJourney | null;
  onNavigate: (view: DashboardView) => void;
  operations: OperationsResponse | null;
  podcastCosts: PodcastCostResponse | null;
  queues: PipelineQueuesResponse | null;
}) {
  const operations = props.operations;
  const top = operations?.priorities.slice(0, 3) ?? [];
  const stale = isStale(operations);

  return (
    <div className="cc-stack today-page">
      <section className={`cc-card today-hero cc-tone-${heroTone(operations)}`}>
        <header className="cc-card-head">
          <div className="cc-card-heading">
            <span className="today-kicker">Operator inbox</span>
            <h2 className="cc-card-title today-hero-title">
              今天最需要你處理的事
            </h2>
            <p className="cc-card-subtitle">
              只保留需要決策或介入的項目。原始 signal、provider
              細節與完整表格放到下一層。
            </p>
          </div>
          <div className="cc-card-action">
            <StatusPill status={operations?.status} />
          </div>
        </header>
        <div className="cc-card-body">
          <HeroNotice operations={operations} stale={stale} top={top.length} />
          <div className="today-actions">
            {top.map((priority) => (
              <ActionCard
                key={priority.signal.fingerprint}
                onNavigate={props.onNavigate}
                priority={priority}
              />
            ))}
            {operations?.status === 'healthy' && !stale && top.length === 0 ? (
              <EmptyState
                detail="系統仍在收集 signals；有事情跨過 action threshold 才會出現在這裡。"
                icon={ShieldCheck}
                title="目前沒有需要你處理的 operational issue"
              />
            ) : null}
          </div>
        </div>
      </section>

      <div className="cc-grid">
        <Card
          action={
            <ViewAllLink
              label="查看全部"
              onClick={() => props.onNavigate('reliability')}
            />
          }
          icon={Bell}
          subtitle="Ranked below the top three"
          title="關鍵警報"
          tone="danger"
        >
          <RankedList
            empty={<AlertsEmpty />}
            items={priorityItems((operations?.priorities ?? []).slice(3, 7))}
          />
        </Card>

        <Card
          action={
            <ViewAllLink
              label="查看詳情"
              onClick={() => props.onNavigate('growth')}
            />
          }
          icon={Clapperboard}
          subtitle="Latest release, per platform"
          title="內容發佈現況"
          tone="info"
        >
          <LatestRelease data={props.data} queues={props.queues} />
        </Card>

        <Card
          action={
            <ViewAllLink
              label="查看全部"
              onClick={() => props.onNavigate('pipeline')}
            />
          }
          icon={Layers}
          subtitle="Runtime queues right now"
          title="Pipeline 一眼看懂"
          tone="accent"
        >
          <QueueGlance queues={props.queues} />
        </Card>
      </div>

      <div className="cc-grid today-lower">
        <Card
          action={
            <ViewAllLink
              label="查看成長"
              onClick={() => props.onNavigate('growth')}
            />
          }
          icon={TrendingUp}
          subtitle="PostHog unique people, last 30 days"
          title="成長摘要"
          tone="success"
        >
          <JourneyGlance journey={props.journey} />
        </Card>

        <Card
          action={
            <ViewAllLink
              label="查看可靠性"
              onClick={() => props.onNavigate('reliability')}
            />
          }
          icon={CircleDollarSign}
          subtitle="Month-end projection and sunk retries"
          title="成本與浪費"
          tone="warning"
        >
          <CostGlance data={props.data} podcastCosts={props.podcastCosts} />
        </Card>
      </div>
    </div>
  );
}

/**
 * The page's single live region. There is exactly one because the two
 * conditions it reports are mutually exclusive, and because an operator
 * scanning for "is anything wrong" should not have to find several.
 */
function HeroNotice(props: {
  operations: OperationsResponse | null;
  stale: boolean;
  top: number;
}) {
  if (!props.operations) {
    return <p className="today-notice">Waiting for operational signals.</p>;
  }
  if (props.stale) {
    return (
      <p className="today-notice" role="status">
        營運資料已過期，請重新整理後再判斷系統是否恢復。
      </p>
    );
  }
  if (props.operations.status !== 'healthy' && props.top === 0) {
    return (
      <p className="today-notice" role="status">
        觀測資料不足或系統尚未恢復，請查看可靠性。
      </p>
    );
  }
  return null;
}

function ActionCard(props: {
  onNavigate: (view: DashboardView) => void;
  priority: OperationalPriority;
}) {
  const { signal } = props.priority;
  const tone = statusTone(signal.status);
  return (
    <article className={`today-action cc-tone-${tone}`}>
      <div className="today-action-head">
        <Pill tone={tone}>{statusText(signal.status)}</Pill>
        <SourceBadge source={signal.source} />
      </div>
      <strong className="today-action-title">{signal.title}</strong>
      {signal.detail ? (
        <p className="today-action-detail">{signal.detail}</p>
      ) : null}
      <div className="today-action-foot">
        <button
          className="today-action-cta"
          onClick={() =>
            props.onNavigate(destinationFor(signal.source, signal.domain))
          }
          type="button"
        >
          立即處理
        </button>
        <span className="today-action-time">
          {relativeTime(signal.observedAt)}
        </span>
        <ProviderLink label="Source" title={signal.title} url={signal.url} />
      </div>
    </article>
  );
}

function AlertsEmpty() {
  return (
    <EmptyState
      detail="每一個跨過 threshold 的 signal 都已經在上面的前三名裡。"
      icon={ShieldCheck}
      title="沒有其他警報"
    />
  );
}

const PUBLISH_TONE: Record<string, Tone> = {
  failed: 'danger',
  published: 'success',
  publishing: 'info',
  queued: 'neutral',
  scheduled: 'neutral',
  skipped: 'neutral',
};

/**
 * The newest release and where each platform lane has got to.
 *
 * Publish state comes from the social queue and view counts from social
 * telemetry: a lane that has published but not yet been measured is a normal
 * state, so the two are shown side by side rather than joined into one number.
 */
function LatestRelease(props: {
  data: OverviewResponse | null;
  queues: PipelineQueuesResponse | null;
}) {
  const measured = props.data?.social.episodes[0] ?? null;
  const release = latestSocialItem(props.queues, measured?.episodeId);
  if (!release && !measured) {
    return (
      <EmptyState
        detail="最近沒有帶著 telemetry 或排程的發佈。"
        title="No recent release"
      />
    );
  }
  const views = new Map(
    (measured?.platforms ?? []).map((entry) => [entry.platform, entry]),
  );
  return (
    <div className="today-release">
      <strong className="today-release-title">
        {release?.title ?? measured?.title}
      </strong>
      <div className="today-release-rows">
        {(release?.platforms ?? []).map((lane) => {
          const metric = views.get(lane.platform);
          return (
            <div
              className="today-release-row"
              key={`${lane.platform}-${lane.languageCode}`}
            >
              <PlatformIdentity platform={lane.platform} />
              <Pill tone={PUBLISH_TONE[lane.status] ?? 'neutral'}>
                {lane.status}
              </Pill>
              <span className="today-release-views">
                {metric?.views === null || metric?.views === undefined
                  ? '—'
                  : integer(metric.views)}
              </span>
              <ProviderLink
                label="查看"
                title={`${release?.title ?? ''} on ${lane.platform}`}
                url={lane.url ?? metric?.postUrl}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Prefer the lane belonging to the episode telemetry is describing; otherwise
 * whatever the queue is working on now. */
function latestSocialItem(
  queues: PipelineQueuesResponse | null,
  episodeId: string | undefined,
): SocialQueueItem | null {
  if (queues?.status !== 'ok') {
    return null;
  }
  const all = [
    ...queues.social.processing,
    ...queues.social.queued,
    ...queues.social.attention,
  ];
  return all.find((item) => item.episodeId === episodeId) ?? all[0] ?? null;
}

/**
 * Queue depth per lane. Deliberately not rendered as "5 / 12": the queues carry
 * a depth, never a capacity, so a denominator here would be invented.
 */
function QueueGlance(props: { queues: PipelineQueuesResponse | null }) {
  return (
    <QueuePanel queues={props.queues}>
      {(queues) => renderLanes(queues)}
    </QueuePanel>
  );
}

function renderLanes(queues: PipelineQueuesResponse) {
  const lanes = [
    { id: 'api', label: '內容擷取 / 翻譯 / TTS', lane: queues.api },
    { id: 'render', label: 'Render 佇列', lane: queues.render },
    { id: 'social', label: '社群發佈佇列', lane: queues.social },
  ];
  return (
    <div className="today-queues">
      {lanes.map((entry) => (
        <div className="today-queue-row" key={entry.id}>
          <span className="today-queue-label">{entry.label}</span>
          <span className="today-queue-counts">
            處理中 {integer(entry.lane.processing.length)} · 排隊{' '}
            {integer(entry.lane.queued.length)}
          </span>
          {entry.lane.attention.length > 0 ? (
            <Pill tone="danger">需介入 {entry.lane.attention.length}</Pill>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function JourneyGlance(props: { journey: SocialGrowthJourney | null }) {
  const journey = props.journey;
  if (!journey) {
    return <EmptyState detail="Analytics 尚未載入。" title="Loading" />;
  }
  if (journey.status !== 'ok') {
    return <EmptyState detail={journey.message} title="Analytics 無法取得" />;
  }
  const stages: FlowStage[] = [
    {
      id: 'landing',
      label: '到站訪客',
      value: integer(journey.landingVisitors30d),
    },
    {
      connector: 'solid',
      id: 'cta',
      label: '點擊 Waitlist CTA',
      rate: share(journey.ctaUsers30d, journey.landingVisitors30d),
      value: integer(journey.ctaUsers30d),
    },
    {
      connector: 'dashed',
      id: 'app',
      label: 'App 訪客',
      value: integer(journey.appVisitors30d),
    },
    {
      connector: 'solid',
      id: 'wallet',
      label: '連上錢包',
      rate: share(journey.walletConnectedUsers30d, journey.appVisitors30d),
      value: integer(journey.walletConnectedUsers30d),
    },
  ];
  return <FlowBand stages={stages} />;
}

function CostGlance(props: {
  data: OverviewResponse | null;
  podcastCosts: PodcastCostResponse | null;
}) {
  const waste = retryWaste(props.podcastCosts);
  const failed = props.podcastCosts?.status === 'error';
  return (
    <div className="today-cost">
      <Stat
        caption="All providers, current month"
        label="Projected month-end"
        value={usdWhole(props.data?.projectedCostUsd)}
      />
      <Stat
        caption={
          waste.wasteUsd === null
            ? failed
              ? (props.podcastCosts?.message ?? 'Ledger unavailable')
              : 'No priced attempts yet'
            : `${usd(waste.wasteUsd)} sunk in failed attempts`
        }
        label="Podcast retry waste"
        tone={waste.rate !== null && waste.rate > 0.15 ? 'danger' : 'neutral'}
        value={waste.rate === null ? '—' : percent(waste.rate)}
      />
    </div>
  );
}

function share(numerator: number, denominator: number): string | null {
  if (denominator <= 0) {
    return null;
  }
  return percent(numerator / denominator);
}

function heroTone(operations: OperationsResponse | null): string {
  return statusTone(operations?.status);
}

function isStale(operations: OperationsResponse | null): boolean {
  if (!operations) {
    return false;
  }
  const at = Date.parse(operations.generatedAt);
  return !Number.isFinite(at) || Date.now() - at > STALE_AFTER_MS;
}
