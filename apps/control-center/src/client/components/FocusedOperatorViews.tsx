import {
  ArrowRight,
  CircleDollarSign,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { StatementsResponse } from '../../shared/statements.js';
import type {
  OperationalPriority,
  OperationalStatus,
  OperationsResponse,
  OperationsSocialResponse,
  OperationsSource,
  OverviewResponse,
  PodcastCostResponse,
  SocialEpisodeSummary,
  SocialGrowthLane,
  SocialGrowthResponse,
  SocialPerformanceResponse,
} from '../../shared/types.js';
import { integer, percent, relativeTime, usd, usdWhole } from '../format.js';
import { PlatformIdentity } from '../platform.js';
import type { DashboardView } from './AppShell.js';
import { GrowthJourneyPanel } from './GrowthJourneyPanel.js';
import { renderSentence } from './statement-sentence.js';

type RetryWaste = { rate: number | null; wasteUsd: number | null };

type TodayProps = {
  data: OverviewResponse | null;
  onNavigate: (view: DashboardView) => void;
  operations: OperationsResponse | null;
  podcastCosts: PodcastCostResponse | null;
};

export function TodayView({
  data,
  onNavigate,
  operations,
  podcastCosts,
}: TodayProps) {
  const priorities = operations?.priorities.slice(0, 3) ?? [];
  const retry = retryWaste(podcastCosts);

  return (
    <div className="view-stack focused-view">
      <section className="panel operator-hero">
        <div className="operator-hero-head">
          <div>
            <span className="operator-kicker">Operator inbox</span>
            <h2>今天最需要你處理的事</h2>
            <p>
              只保留需要決策或介入的項目。原始 signal、provider
              細節與完整表格放到下一層。
            </p>
          </div>
          <span
            className={`operator-health ${operations?.status ?? 'unknown'}`}
          >
            {statusText(operations?.status)}
          </span>
        </div>
        <div className="operator-action-grid">
          {priorities.map((priority, index) => (
            <PriorityAction
              index={index}
              key={priority.signal.fingerprint}
              onNavigate={onNavigate}
              priority={priority}
            />
          ))}
          {operations && priorities.length === 0 ? <NoIntervention /> : null}
          {!operations ? (
            <div className="empty-inline">Waiting for operational signals.</div>
          ) : null}
        </div>
      </section>

      <div className="operator-dashboard-grid">
        <SummaryCard kicker="Company pulse" title="公司現在怎麼樣">
          <div className="operator-metric-grid">
            <OperatorMetric
              label="Active portfolios · 7d"
              value={integer(data?.product.activePortfolios7d)}
            />
            <OperatorMetric
              label="Tracked audience"
              value={integer(data?.socialReach)}
            />
            <OperatorMetric
              label="Observed AUM"
              value={usdWhole(data?.product.observedPortfolioUsd)}
            />
            <OperatorMetric
              label="Month-end spend"
              value={usdWhole(data?.projectedCostUsd)}
            />
          </div>
        </SummaryCard>

        <SummaryCard
          action={
            <NavigateLink label="成長" onClick={() => onNavigate('growth')} />
          }
          kicker="Latest release"
          title="最新內容發佈現況"
        >
          <ReleaseSummary
            empty="No recent release telemetry."
            episode={data?.social.episodes[0] ?? null}
            showEngagementLabel
          />
        </SummaryCard>

        <SummaryCard
          action={
            <NavigateLink
              label="可靠性"
              onClick={() => onNavigate('reliability')}
            />
          }
          kicker="Cost & waste"
          title="花費有沒有失控"
        >
          <CostGlance projected={data?.projectedCostUsd} retry={retry} />
        </SummaryCard>
      </div>
    </div>
  );
}

function NoIntervention() {
  return (
    <article className="operator-action-card healthy">
      <ShieldCheck aria-hidden="true" />
      <div>
        <span className="operator-action-label">No intervention</span>
        <strong>目前沒有需要你處理的 operational issue</strong>
        <p>
          系統會繼續收集 signals；有事情跨過 action threshold 才會出現在這裡。
        </p>
      </div>
    </article>
  );
}

function PriorityAction({
  index,
  onNavigate,
  priority,
}: {
  index: number;
  onNavigate: (view: DashboardView) => void;
  priority: OperationalPriority;
}) {
  const { signal } = priority;
  return (
    <article className={`operator-action-card ${signal.status}`}>
      <span className="operator-action-rank">{index + 1}</span>
      <div>
        <span className="operator-action-label">
          {sourceLabel(signal.source)} · {signal.status}
        </span>
        <strong>{signal.title}</strong>
        {signal.detail ? <p>{signal.detail}</p> : null}
        <small>{relativeTime(signal.observedAt)}</small>
      </div>
      <div className="operator-action-links">
        <button
          onClick={() =>
            onNavigate(destinationFor(signal.source, signal.domain))
          }
          type="button"
        >
          查看
        </button>
        <SourceLink label="Source" title={signal.title} url={signal.url} />
      </div>
    </article>
  );
}

type GrowthFocusProps = {
  data: SocialPerformanceResponse | null;
  growth: SocialGrowthResponse | null;
  onWindowChange: (
    window: SocialPerformanceResponse['window'],
  ) => Promise<void>;
  statements?: StatementsResponse | null;
};

export function GrowthFocusView({
  data,
  growth,
  onWindowChange,
  statements,
}: GrowthFocusProps) {
  const waitlist = growth?.waitlist ?? null;
  const statement = statements?.headers.find(
    (header) => header.domain === 'growth',
  );

  return (
    <div className="view-stack focused-view">
      <section className="operator-intro-row">
        <div>
          <span className="operator-kicker">One journey</span>
          <h2>從內容一路看到產品需求</h2>
          <p>
            不再分開看 follower、PostHog、waitlist
            與貼文表格；先回答「流量有沒有變成需求」。
          </p>
        </div>
        <WindowPicker
          active={data?.window ?? 'latest'}
          onChange={onWindowChange}
        />
      </section>

      {statement ? (
        <div className={`operator-callout ${statement.status}`}>
          <Sparkles aria-hidden="true" />
          <span>{renderSentence(statement.sentence)}</span>
        </div>
      ) : null}

      <GrowthJourneyPanel growth={growth} />

      <div className="operator-dashboard-grid growth-focus-grid">
        <SummaryCard kicker="Latest release" title="最新一集表現">
          <ReleaseSummary
            empty="No published episode telemetry."
            episode={data?.episodes[0] ?? null}
          />
        </SummaryCard>

        <SummaryCard kicker="Waitlist" title="需求有沒有累積">
          {waitlist?.status === 'ok' ? (
            <div className="waitlist-glance-grid">
              <OperatorMetric label="Total" value={integer(waitlist.total)} />
              <OperatorMetric
                label="Last 7d"
                value={integer(waitlist.signups7d)}
              />
              <OperatorMetric
                label="From social · 7d"
                value={integer(waitlist.attributedSocial7d)}
              />
              <OperatorMetric
                label="Direct / unknown · 7d"
                value={integer(waitlist.directOrUnknown7d)}
              />
            </div>
          ) : (
            <div className="empty-inline">
              {waitlist?.message ?? 'Waitlist telemetry unavailable.'}
            </div>
          )}
        </SummaryCard>

        <SummaryCard
          className="growth-language-card"
          kicker="Only lane variable"
          title="語言表現"
        >
          <LanguageSignals growth={growth} />
        </SummaryCard>
      </div>

      <GrowthEvidence data={data} growth={growth} />
    </div>
  );
}

type ReliabilityFocusProps = {
  data: OperationsResponse | null;
  overview: OverviewResponse | null;
  podcastCosts: PodcastCostResponse | null;
  social: OperationsSocialResponse | null;
  statements?: StatementsResponse | null;
};

const HEALTH_SOURCES: OperationsSource[] = [
  'github-actions',
  'sentry',
  'fly',
  'posthog',
  'cost-ledger',
  'social-daemon',
];

export function ReliabilityFocusView({
  data,
  overview,
  podcastCosts,
  social,
  statements,
}: ReliabilityFocusProps) {
  const retry = retryWaste(podcastCosts);
  const risks = data?.priorities.slice(0, 5) ?? [];
  const statement = statements?.headers.find(
    (header) => header.domain === 'reliability',
  );

  return (
    <div className="view-stack focused-view">
      <ReliabilityHero
        data={data}
        overview={overview}
        retry={retry}
        riskCount={risks.length}
        social={social}
      />

      {statement ? (
        <div className={`operator-callout ${statement.status}`}>
          <ShieldCheck aria-hidden="true" />
          <span>{renderSentence(statement.sentence)}</span>
        </div>
      ) : null}

      <div className="reliability-focus-grid">
        <SummaryCard
          className="reliability-risks"
          kicker="Do this first"
          title="目前風險"
        >
          <RiskList data={data} risks={risks} />
        </SummaryCard>

        <SummaryCard kicker="Coverage" title="關鍵系統訊號">
          <div className="source-health-grid">
            {HEALTH_SOURCES.map((source) => {
              const status = sourceStatus(data, source);
              return (
                <div className="source-health-row" key={source}>
                  <span className={`source-health-dot ${status}`} />
                  <strong>{sourceLabel(source)}</strong>
                  <small>{statusText(status)}</small>
                </div>
              );
            })}
          </div>
        </SummaryCard>

        <SummaryCard
          className="reliability-cost-card"
          kicker="Cost & waste"
          title="錢花在哪裡"
        >
          <ProviderCosts overview={overview} retry={retry} />
        </SummaryCard>
      </div>

      <ReliabilityEvidence data={data} />
    </div>
  );
}

function ReliabilityHero({
  data,
  overview,
  retry,
  riskCount,
  social,
}: {
  data: OperationsResponse | null;
  overview: OverviewResponse | null;
  retry: RetryWaste;
  riskCount: number;
  social: OperationsSocialResponse | null;
}) {
  return (
    <section className={`panel reliability-hero ${data?.status ?? 'unknown'}`}>
      <div>
        <span className="operator-kicker">Operational health</span>
        <h2>{statusText(data?.status)}</h2>
        <p>
          Reliability 現在同時回答：系統有沒有壞、deploy/pipeline
          是否有風險、以及成本是否異常。
        </p>
      </div>
      <div className="reliability-hero-metrics">
        <OperatorMetric label="需要介入" value={integer(riskCount)} />
        <OperatorMetric
          label="Social daemon"
          value={statusText(social?.daemon.status)}
        />
        <OperatorMetric
          label="Projected spend"
          value={usd(overview?.projectedCostUsd)}
        />
        <OperatorMetric label="Retry waste" value={percent(retry.rate)} />
      </div>
    </section>
  );
}

function RiskList({
  data,
  risks,
}: {
  data: OperationsResponse | null;
  risks: OperationalPriority[];
}) {
  if (data && risks.length === 0) {
    return <div className="empty-inline">Nothing needs intervention.</div>;
  }
  return (
    <div className="reliability-risk-list">
      {risks.map((priority, index) => (
        <article key={priority.signal.fingerprint}>
          <span className={`risk-rank ${priority.signal.status}`}>
            {index + 1}
          </span>
          <div>
            <strong>{priority.signal.title}</strong>
            <small>
              {sourceLabel(priority.signal.source)} ·{' '}
              {relativeTime(priority.signal.observedAt)}
            </small>
            {priority.signal.detail ? <p>{priority.signal.detail}</p> : null}
          </div>
          <SourceLink title={priority.signal.title} url={priority.signal.url} />
        </article>
      ))}
    </div>
  );
}

function ProviderCosts({
  overview,
  retry,
}: {
  overview: OverviewResponse | null;
  retry: RetryWaste;
}) {
  const providers = [...(overview?.providers ?? [])]
    .filter(
      (provider) =>
        provider.snapshot?.accruedCostUsd !== null &&
        provider.snapshot?.accruedCostUsd !== undefined,
    )
    .sort(
      (left, right) =>
        (right.snapshot?.accruedCostUsd ?? 0) -
        (left.snapshot?.accruedCostUsd ?? 0),
    );
  const max = providers[0]?.snapshot?.accruedCostUsd ?? 0;

  return (
    <>
      <div className="reliability-cost-headline">
        <OperatorMetric
          label="Projected month-end"
          value={usd(overview?.projectedCostUsd)}
        />
        <OperatorMetric label="Retry waste" value={percent(retry.rate)} />
      </div>
      <div className="provider-mini-list">
        {providers.slice(0, 5).map((provider) => {
          const cost = provider.snapshot?.accruedCostUsd ?? 0;
          return (
            <div className="provider-mini-row" key={provider.provider}>
              <span>{provider.label}</span>
              <span className="provider-mini-track">
                <i style={{ width: `${max > 0 ? (cost / max) * 100 : 0}%` }} />
              </span>
              <strong>{usd(cost)}</strong>
            </div>
          );
        })}
        {providers.length === 0 ? (
          <div className="empty-inline">
            No current provider cost snapshots.
          </div>
        ) : null}
      </div>
    </>
  );
}

function ReleaseSummary({
  empty,
  episode,
  showEngagementLabel = false,
}: {
  empty: string;
  episode: SocialEpisodeSummary | null;
  showEngagementLabel?: boolean;
}) {
  if (!episode) {
    return <div className="empty-inline">{empty}</div>;
  }
  return (
    <>
      <strong className="operator-feature-title">{episode.title}</strong>
      <div className="release-platform-list">
        {episode.platforms.map((platform, index) => (
          <div
            className="release-platform-row"
            key={`${platform.platform}:${platform.postUrl ?? index}`}
          >
            <PlatformIdentity platform={platform.platform} />
            <span>{integer(platform.views)} views</span>
            <span>
              {percent(platform.engagementRate)}
              {showEngagementLabel ? ' engagement' : ''}
            </span>
            <SourceLink
              label=""
              title={`${platform.platform} post`}
              url={platform.postUrl}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function LanguageSignals({ growth }: { growth: SocialGrowthResponse | null }) {
  const platforms = growth?.platforms ?? [];
  if (growth && platforms.length === 0) {
    return <div className="empty-inline">No language performance yet.</div>;
  }
  return (
    <div className="language-signal-list">
      {platforms.map((platform) => (
        <div className="language-signal-row" key={platform.platform}>
          <strong>
            <PlatformIdentity platform={platform.platform} />
          </strong>
          <div>
            {platform.lanes.map((lane) => (
              <span className="language-chip" key={lane.languageCode}>
                <b>{lane.languageCode}</b>
                {languageSignal(lane)}
              </span>
            ))}
            {platform.lanes.length === 0 ? <small>No lane data</small> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function GrowthEvidence({
  data,
  growth,
}: {
  data: SocialPerformanceResponse | null;
  growth: SocialGrowthResponse | null;
}) {
  const waitlist = growth?.waitlist;
  return (
    <details className="panel operator-evidence">
      <summary>
        <span>
          <strong>Evidence</strong>
          <small>
            完整 attribution、waitlist conversion 與 recent episode data
          </small>
        </span>
      </summary>
      <div className="operator-evidence-body">
        <section>
          <h3>Waitlist conversion evidence</h3>
          {waitlist?.status === 'ok' ? (
            <div className="evidence-row-list">
              {waitlist.conversions.slice(0, 10).map((conversion) => (
                <div
                  className="evidence-row"
                  key={conversion.socialPublishJobId}
                >
                  <span>{conversion.episodeId.slice(0, 8)}</span>
                  <PlatformIdentity platform={conversion.platform} />
                  <span>{conversion.languageCode}</span>
                  <strong>{integer(conversion.signups)} signups</strong>
                  <span>{percent(conversion.signupRate)}</span>
                </div>
              ))}
              {waitlist.conversions.length === 0 ? (
                <div className="empty-inline">
                  No attributed conversions yet.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty-inline">
              {waitlist?.message ?? 'Waitlist telemetry unavailable.'}
            </div>
          )}
        </section>
        <section>
          <h3>Recent episode evidence</h3>
          <div className="evidence-row-list">
            {(data?.episodes ?? []).slice(0, 6).map((episode) => (
              <div
                className="evidence-row evidence-episode-row"
                key={episode.episodeId}
              >
                <strong>{episode.title}</strong>
                <span>{integer(episode.totalViews)} views</span>
                <span>{integer(episode.totalImpressions)} impressions</span>
                <span>{episode.platforms.length} platforms</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </details>
  );
}

function ReliabilityEvidence({ data }: { data: OperationsResponse | null }) {
  return (
    <details className="panel operator-evidence">
      <summary>
        <span>
          <strong>Signal evidence</strong>
          <small>
            Raw source signals are available for audit, but no longer compete
            with the decision surface.
          </small>
        </span>
      </summary>
      <div className="operator-evidence-body signal-evidence-list">
        {(data?.signals ?? []).map((signal) => (
          <article key={signal.fingerprint}>
            <span className={`source-health-dot ${signal.status}`} />
            <div>
              <strong>{signal.title}</strong>
              <small>{signal.fingerprint}</small>
            </div>
            <span>{sourceLabel(signal.source)}</span>
            <span>{signal.domain}</span>
            <time>{relativeTime(signal.observedAt)}</time>
          </article>
        ))}
      </div>
    </details>
  );
}

function SummaryCard({
  action,
  children,
  className = '',
  kicker,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  kicker: string;
  title: string;
}) {
  return (
    <section className={`panel operator-summary-card ${className}`.trim()}>
      <div className="operator-section-head">
        <div>
          <span className="operator-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function NavigateLink({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="operator-text-button" onClick={onClick} type="button">
      {label} <ArrowRight aria-hidden="true" />
    </button>
  );
}

function SourceLink({
  label = '',
  title,
  url,
}: {
  label?: string;
  title: string;
  url: string | null | undefined;
}) {
  if (!url) {
    return null;
  }
  return (
    <a aria-label={`Open ${title}`} href={url} rel="noreferrer" target="_blank">
      {label} <ExternalLink aria-hidden="true" />
    </a>
  );
}

function WindowPicker({
  active,
  onChange,
}: {
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
    <div className="window-picker" aria-label="Growth window">
      {windows.map((window) => (
        <button
          aria-pressed={active === window}
          className={active === window ? 'active' : undefined}
          key={window}
          onClick={() => void onChange(window)}
          type="button"
        >
          {window}
        </button>
      ))}
    </div>
  );
}

function CostGlance({
  projected,
  retry,
}: {
  projected: number | null | undefined;
  retry: RetryWaste;
}) {
  return (
    <div className="cost-glance">
      <div>
        <CircleDollarSign aria-hidden="true" />
        <span>Projected month-end</span>
        <strong>{usd(projected)}</strong>
      </div>
      <div>
        <TriangleAlert aria-hidden="true" />
        <span>Podcast retry waste</span>
        <strong>{percent(retry.rate)}</strong>
        <small>{usd(retry.wasteUsd)} sunk in failed attempts</small>
      </div>
    </div>
  );
}

function OperatorMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="operator-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function retryWaste(data: PodcastCostResponse | null): RetryWaste {
  if (!data || data.status !== 'ok' || data.episodes.length === 0) {
    return { rate: null, wasteUsd: null };
  }
  const totals = data.episodes.reduce(
    (sum, episode) => ({
      all: sum.all + episode.totalCostUsd,
      wasted: sum.wasted + episode.retryWasteUsd,
    }),
    { all: 0, wasted: 0 },
  );
  return {
    rate: totals.all > 0 ? totals.wasted / totals.all : 0,
    wasteUsd: totals.wasted,
  };
}

function languageSignal(lane: SocialGrowthLane): string {
  const parts = [`${integer(lane.postCount7d)} posts`];
  if (lane.medianReach24h !== null) {
    parts.push(`${integer(lane.medianReach24h)} median reach`);
  }
  if (lane.followersPer1kReach !== null) {
    parts.push(`${lane.followersPer1kReach.toFixed(1)} followers / 1k`);
  }
  return parts.join(' · ');
}

function sourceStatus(
  data: OperationsResponse | null,
  source: OperationsSource,
): OperationalStatus {
  const states = (data?.signals ?? [])
    .filter((signal) => signal.source === source)
    .map((signal) => signal.status);
  if (states.includes('critical')) {
    return 'critical';
  }
  if (states.includes('degraded')) {
    return 'degraded';
  }
  if (states.includes('unknown') || states.length === 0) {
    return 'unknown';
  }
  return 'healthy';
}

function statusText(status: OperationalStatus | undefined): string {
  const labels: Record<OperationalStatus, string> = {
    healthy: 'Healthy',
    degraded: 'Needs attention',
    critical: 'Action required',
    unknown: 'Unknown',
  };
  return labels[status ?? 'unknown'];
}

const SOURCE_LABELS = new Map<OperationsSource, string>([
  ['customer-economics', 'Customer data'],
  ['product-health', 'Product data'],
  ['cost-ledger', 'Cost ledger'],
  ['social-queue', 'Social queue'],
  ['social-daemon', 'Social daemon'],
  ['github-actions', 'GitHub Actions'],
  ['fly', 'Fly.io'],
  ['sentry', 'Sentry'],
  ['posthog', 'PostHog'],
]);

function sourceLabel(source: OperationsSource): string {
  return SOURCE_LABELS.get(source) ?? source;
}

function destinationFor(
  source: OperationsSource,
  domain: OperationsResponse['signals'][number]['domain'],
): DashboardView {
  if (source === 'social-queue' || source === 'social-daemon') {
    return 'pipeline';
  }
  if (domain === 'analytics') {
    return 'growth';
  }
  return 'reliability';
}
