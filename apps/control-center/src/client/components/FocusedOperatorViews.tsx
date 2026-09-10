import {
  ArrowRight,
  CircleDollarSign,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';

import type { StatementsResponse } from '../../shared/statements.js';
import type {
  OperationalPriority,
  OperationalSource,
  OperationalStatus,
  OperationsResponse,
  OperationsSocialResponse,
  OverviewResponse,
  PodcastCostResponse,
  SocialGrowthLane,
  SocialGrowthResponse,
  SocialPerformanceResponse,
} from '../../shared/types.js';
import { integer, percent, relativeTime, usd, usdWhole } from '../format.js';
import { PlatformIdentity } from '../platform.js';
import type { DashboardView } from './AppShell.js';
import { GrowthJourneyPanel } from './GrowthJourneyPanel.js';
import { renderSentence } from './statement-sentence.js';

export function TodayView(props: {
  data: OverviewResponse | null;
  onNavigate: (view: DashboardView) => void;
  operations: OperationsResponse | null;
  podcastCosts: PodcastCostResponse | null;
}) {
  const priorities = props.operations?.priorities.slice(0, 3) ?? [];
  const latestEpisode = props.data?.social.episodes[0] ?? null;
  const retry = retryWaste(props.podcastCosts);

  return (
    <div className="view-stack focused-view">
      <section className="panel operator-hero">
        <div className="operator-hero-head">
          <div>
            <span className="operator-kicker">Operator inbox</span>
            <h2>今天最需要你處理的事</h2>
            <p>
              只保留需要決策或介入的項目。原始 signal、provider 細節與完整表格放到下一層。
            </p>
          </div>
          <span
            className={`operator-health ${props.operations?.status ?? 'unknown'}`}
          >
            {statusText(props.operations?.status)}
          </span>
        </div>

        <div className="operator-action-grid">
          {priorities.map((priority, index) => (
            <PriorityAction
              index={index}
              key={priority.signal.fingerprint}
              onNavigate={props.onNavigate}
              priority={priority}
            />
          ))}
          {props.operations && priorities.length === 0 ? (
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
          ) : null}
          {!props.operations ? (
            <div className="empty-inline">Waiting for operational signals.</div>
          ) : null}
        </div>
      </section>

      <div className="operator-dashboard-grid">
        <section className="panel operator-summary-card operator-pulse">
          <div className="operator-section-head">
            <div>
              <span className="operator-kicker">Company pulse</span>
              <h2>公司現在怎麼樣</h2>
            </div>
          </div>
          <div className="operator-metric-grid">
            <OperatorMetric
              label="Active portfolios · 7d"
              value={integer(props.data?.product.activePortfolios7d)}
            />
            <OperatorMetric
              label="Tracked audience"
              value={integer(props.data?.socialReach)}
            />
            <OperatorMetric
              label="Observed AUM"
              value={usdWhole(props.data?.product.observedPortfolioUsd)}
            />
            <OperatorMetric
              label="Month-end spend"
              value={usdWhole(props.data?.projectedCostUsd)}
            />
          </div>
        </section>

        <section className="panel operator-summary-card">
          <div className="operator-section-head">
            <div>
              <span className="operator-kicker">Latest release</span>
              <h2>最新內容發佈現況</h2>
            </div>
            <button
              className="operator-text-button"
              onClick={() => props.onNavigate('growth')}
              type="button"
            >
              成長 <ArrowRight aria-hidden="true" />
            </button>
          </div>
          {latestEpisode ? (
            <>
              <strong className="operator-feature-title">
                {latestEpisode.title}
              </strong>
              <div className="release-platform-list">
                {latestEpisode.platforms.map((platform, index) => (
                  <div
                    className="release-platform-row"
                    key={`${platform.platform}:${platform.postUrl ?? index}`}
                  >
                    <PlatformIdentity platform={platform.platform} />
                    <span>{integer(platform.views)} views</span>
                    <span>{percent(platform.engagementRate)} engagement</span>
                    {platform.postUrl ? (
                      <a
                        aria-label={`Open ${platform.platform} post`}
                        href={platform.postUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink aria-hidden="true" />
                      </a>
                    ) : (
                      <small>no link</small>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-inline">No recent release telemetry.</div>
          )}
        </section>

        <section className="panel operator-summary-card">
          <div className="operator-section-head">
            <div>
              <span className="operator-kicker">Cost & waste</span>
              <h2>花費有沒有失控</h2>
            </div>
            <button
              className="operator-text-button"
              onClick={() => props.onNavigate('reliability')}
              type="button"
            >
              可靠性 <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <div className="cost-glance">
            <div>
              <CircleDollarSign aria-hidden="true" />
              <span>Projected month-end</span>
              <strong>{usd(props.data?.projectedCostUsd)}</strong>
            </div>
            <div>
              <TriangleAlert aria-hidden="true" />
              <span>Podcast retry waste</span>
              <strong>{percent(retry.rate)}</strong>
              <small>{usd(retry.wasteUsd)} sunk in failed attempts</small>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PriorityAction(props: {
  index: number;
  onNavigate: (view: DashboardView) => void;
  priority: OperationalPriority;
}) {
  const { signal } = props.priority;
  const destination = destinationFor(signal.source, signal.domain);
  return (
    <article className={`operator-action-card ${signal.status}`}>
      <span className="operator-action-rank">{props.index + 1}</span>
      <div>
        <span className="operator-action-label">
          {sourceLabel(signal.source)} · {signal.status}
        </span>
        <strong>{signal.title}</strong>
        {signal.detail ? <p>{signal.detail}</p> : null}
        <small>{relativeTime(signal.observedAt)}</small>
      </div>
      <div className="operator-action-links">
        <button onClick={() => props.onNavigate(destination)} type="button">
          查看
        </button>
        {signal.url ? (
          <a href={signal.url} rel="noreferrer" target="_blank">
            Source <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function GrowthFocusView(props: {
  data: SocialPerformanceResponse | null;
  growth: SocialGrowthResponse | null;
  onWindowChange: (
    window: SocialPerformanceResponse['window'],
  ) => Promise<void>;
  statements?: StatementsResponse | null;
}) {
  const latestEpisode = props.data?.episodes[0] ?? null;
  const waitlist = props.growth?.waitlist ?? null;
  const growthStatement = props.statements?.headers.find(
    (header) => header.domain === 'growth',
  );

  return (
    <div className="view-stack focused-view">
      <section className="operator-intro-row">
        <div>
          <span className="operator-kicker">One journey</span>
          <h2>從內容一路看到產品需求</h2>
          <p>
            不再分開看 follower、PostHog、waitlist 與貼文表格；先回答「流量有沒有變成需求」。
          </p>
        </div>
        <WindowPicker
          active={props.data?.window ?? 'latest'}
          onChange={props.onWindowChange}
        />
      </section>

      {growthStatement ? (
        <div className={`operator-callout ${growthStatement.status}`}>
          <Sparkles aria-hidden="true" />
          <span>{renderSentence(growthStatement.sentence)}</span>
        </div>
      ) : null}

      <GrowthJourneyPanel growth={props.growth} />

      <div className="operator-dashboard-grid growth-focus-grid">
        <section className="panel operator-summary-card">
          <div className="operator-section-head">
            <div>
              <span className="operator-kicker">Latest release</span>
              <h2>最新一集表現</h2>
            </div>
          </div>
          {latestEpisode ? (
            <>
              <strong className="operator-feature-title">
                {latestEpisode.title}
              </strong>
              <div className="release-platform-list">
                {latestEpisode.platforms.map((platform, index) => (
                  <div
                    className="release-platform-row"
                    key={`${platform.platform}:${platform.postUrl ?? index}`}
                  >
                    <PlatformIdentity platform={platform.platform} />
                    <span>{integer(platform.views)} views</span>
                    <span>{percent(platform.engagementRate)}</span>
                    {platform.postUrl ? (
                      <a
                        aria-label={`Open ${platform.platform} post`}
                        href={platform.postUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-inline">No published episode telemetry.</div>
          )}
        </section>

        <section className="panel operator-summary-card">
          <div className="operator-section-head">
            <div>
              <span className="operator-kicker">Waitlist</span>
              <h2>需求有沒有累積</h2>
            </div>
          </div>
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
        </section>

        <section className="panel operator-summary-card growth-language-card">
          <div className="operator-section-head">
            <div>
              <span className="operator-kicker">Only lane variable</span>
              <h2>語言表現</h2>
            </div>
          </div>
          <div className="language-signal-list">
            {(props.growth?.platforms ?? []).map((platform) => (
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
                  {platform.lanes.length === 0 ? (
                    <small>No lane data</small>
                  ) : null}
                </div>
              </div>
            ))}
            {props.growth && props.growth.platforms.length === 0 ? (
              <div className="empty-inline">No language performance yet.</div>
            ) : null}
          </div>
        </section>
      </div>

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
          <EvidenceWaitlist growth={props.growth} />
          <EvidenceEpisodes data={props.data} />
        </div>
      </details>
    </div>
  );
}

export function ReliabilityFocusView(props: {
  data: OperationsResponse | null;
  overview: OverviewResponse | null;
  podcastCosts: PodcastCostResponse | null;
  social: OperationsSocialResponse | null;
  statements?: StatementsResponse | null;
}) {
  const retry = retryWaste(props.podcastCosts);
  const risks = props.data?.priorities.slice(0, 5) ?? [];
  const providers = [...(props.overview?.providers ?? [])]
    .filter((provider) => provider.snapshot?.accruedCostUsd != null)
    .sort(
      (left, right) =>
        (right.snapshot?.accruedCostUsd ?? 0) -
        (left.snapshot?.accruedCostUsd ?? 0),
    );
  const maxProviderCost = providers[0]?.snapshot?.accruedCostUsd ?? 0;
  const reliabilityStatement = props.statements?.headers.find(
    (header) => header.domain === 'reliability',
  );

  return (
    <div className="view-stack focused-view">
      <section
        className={`panel reliability-hero ${props.data?.status ?? 'unknown'}`}
      >
        <div>
          <span className="operator-kicker">Operational health</span>
          <h2>{statusText(props.data?.status)}</h2>
          <p>
            Reliability 現在同時回答：系統有沒有壞、deploy/pipeline 是否有風險、以及成本是否異常。
          </p>
        </div>
        <div className="reliability-hero-metrics">
          <OperatorMetric label="需要介入" value={integer(risks.length)} />
          <OperatorMetric
            label="Social daemon"
            value={statusText(props.social?.daemon.status)}
          />
          <OperatorMetric
            label="Projected spend"
            value={usd(props.overview?.projectedCostUsd)}
          />
          <OperatorMetric label="Retry waste" value={percent(retry.rate)} />
        </div>
      </section>

      {reliabilityStatement ? (
        <div className={`operator-callout ${reliabilityStatement.status}`}>
          <ShieldCheck aria-hidden="true" />
          <span>{renderSentence(reliabilityStatement.sentence)}</span>
        </div>
      ) : null}

      <div className="reliability-focus-grid">
        <section className="panel operator-summary-card reliability-risks">
          <div className="operator-section-head">
            <div>
              <span className="operator-kicker">Do this first</span>
              <h2>目前風險</h2>
            </div>
          </div>
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
                {priority.signal.url ? (
                  <a
                    aria-label={`Open source for ${priority.signal.title}`}
                    href={priority.signal.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden="true" />
                  </a>
                ) : null}
              </article>
            ))}
            {props.data && risks.length === 0 ? (
              <div className="empty-inline">Nothing needs intervention.</div>
            ) : null}
          </div>
        </section>

        <section className="panel operator-summary-card">
          <div className="operator-section-head">
            <div>
              <span className="operator-kicker">Coverage</span>
              <h2>關鍵系統訊號</h2>
            </div>
          </div>
          <div className="source-health-grid">
            {(
              [
                'github-actions',
                'sentry',
                'fly',
                'posthog',
                'cost-ledger',
                'social-daemon',
              ] satisfies OperationalSource[]
            ).map((source) => {
              const status = sourceStatus(props.data, source);
              return (
                <div className="source-health-row" key={source}>
                  <span className={`source-health-dot ${status}`} />
                  <strong>{sourceLabel(source)}</strong>
                  <small>{statusText(status)}</small>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel operator-summary-card reliability-cost-card">
          <div className="operator-section-head">
            <div>
              <span className="operator-kicker">Cost & waste</span>
              <h2>錢花在哪裡</h2>
            </div>
          </div>
          <div className="reliability-cost-headline">
            <div>
              <span>Projected month-end</span>
              <strong>{usd(props.overview?.projectedCostUsd)}</strong>
            </div>
            <div>
              <span>Retry waste</span>
              <strong>{percent(retry.rate)}</strong>
              <small>{usd(retry.wasteUsd)}</small>
            </div>
          </div>
          <div className="provider-mini-list">
            {providers.slice(0, 5).map((provider) => {
              const cost = provider.snapshot?.accruedCostUsd ?? 0;
              return (
                <div className="provider-mini-row" key={provider.provider}>
                  <span>{provider.label}</span>
                  <span className="provider-mini-track">
                    <i
                      style={{
                        width: `${
                          maxProviderCost > 0
                            ? (cost / maxProviderCost) * 100
                            : 0
                        }%`,
                      }}
                    />
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
        </section>
      </div>

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
          {(props.data?.signals ?? []).map((signal) => (
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
    </div>
  );
}

function WindowPicker(props: {
  active: SocialPerformanceResponse['window'];
  onChange: (
    window: SocialPerformanceResponse['window'],
  ) => Promise<void>;
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

function EvidenceWaitlist(props: { growth: SocialGrowthResponse | null }) {
  const waitlist = props.growth?.waitlist;
  return (
    <section>
      <h3>Waitlist conversion evidence</h3>
      {waitlist?.status === 'ok' ? (
        <div className="evidence-row-list">
          {waitlist.conversions.slice(0, 10).map((conversion) => (
            <div className="evidence-row" key={conversion.socialPublishJobId}>
              <span>{conversion.episodeId.slice(0, 8)}</span>
              <PlatformIdentity platform={conversion.platform} />
              <span>{conversion.languageCode}</span>
              <strong>{integer(conversion.signups)} signups</strong>
              <span>{percent(conversion.signupRate)}</span>
            </div>
          ))}
          {waitlist.conversions.length === 0 ? (
            <div className="empty-inline">No attributed conversions yet.</div>
          ) : null}
        </div>
      ) : (
        <div className="empty-inline">
          {waitlist?.message ?? 'Waitlist telemetry unavailable.'}
        </div>
      )}
    </section>
  );
}

function EvidenceEpisodes(props: { data: SocialPerformanceResponse | null }) {
  return (
    <section>
      <h3>Recent episode evidence</h3>
      <div className="evidence-row-list">
        {(props.data?.episodes ?? []).slice(0, 6).map((episode) => (
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
  );
}

function OperatorMetric(props: { label: string; value: string }) {
  return (
    <div className="operator-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function retryWaste(data: PodcastCostResponse | null): {
  rate: number | null;
  wasteUsd: number | null;
} {
  if (!data || data.status !== 'ok' || data.episodes.length === 0) {
    return { rate: null, wasteUsd: null };
  }
  const total = data.episodes.reduce(
    (sum, episode) => sum + episode.totalCostUsd,
    0,
  );
  const waste = data.episodes.reduce(
    (sum, episode) => sum + episode.retryWasteUsd,
    0,
  );
  return {
    rate: total > 0 ? waste / total : 0,
    wasteUsd: waste,
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
  source: OperationalSource,
): OperationalStatus {
  const statuses = (data?.signals ?? [])
    .filter((signal) => signal.source === source)
    .map((signal) => signal.status);
  if (statuses.length === 0) return 'unknown';
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.includes('unknown')) return 'unknown';
  return 'healthy';
}

function statusText(status: OperationalStatus | undefined): string {
  return {
    healthy: 'Healthy',
    degraded: 'Needs attention',
    critical: 'Action required',
    unknown: 'Unknown',
  }[status ?? 'unknown'];
}

function sourceLabel(source: OperationalSource): string {
  return {
    'customer-economics': 'Customer data',
    'product-health': 'Product data',
    'cost-ledger': 'Cost ledger',
    'social-queue': 'Social queue',
    'social-daemon': 'Social daemon',
    'github-actions': 'GitHub Actions',
    fly: 'Fly.io',
    sentry: 'Sentry',
    posthog: 'PostHog',
  }[source];
}

function destinationFor(
  source: OperationalSource,
  domain: OperationsResponse['signals'][number]['domain'],
): DashboardView {
  if (source === 'social-queue' || source === 'social-daemon') return 'pipeline';
  if (domain === 'analytics') return 'growth';
  return 'reliability';
}
