import type {
  SocialDecision,
  SocialGrowthResponse,
  SocialPerformanceResponse,
  SocialPlatformPerformance,
} from '../../shared/types.js';
import { duration, integer, percent, relativeTime } from '../format.js';
import { platformLabel } from '../platform.js';

const windows: SocialPerformanceResponse['window'][] = [
  'latest',
  '24h',
  '72h',
  '7d',
];

export function GrowthView(props: {
  data: SocialPerformanceResponse | null;
  growth: SocialGrowthResponse | null;
  onWindowChange: (
    window: SocialPerformanceResponse['window'],
  ) => Promise<void>;
}) {
  const data = props.data;
  const followerTotal = sumKnown(
    data?.accounts.map((account) => account.followers) ?? [],
  );
  const latest = data?.episodes[0];

  return (
    <div className="social-layout">
      <div className="social-main">
        <div className="window-tabs" aria-label="Metric snapshot window">
          {windows.map((window) => (
            <button
              className={data?.window === window ? 'active' : undefined}
              key={window}
              onClick={() => void props.onWindowChange(window)}
              type="button"
            >
              {window === 'latest' ? 'Latest' : window}
            </button>
          ))}
        </div>

        <section className="decision-section">
          <div className="section-head">
            <h2>Publishing decisions</h2>
            <small className="panel-note">
              Learned from standardized 24h samples
            </small>
          </div>
          <div className="decision-grid">
            {(data?.decisions ?? []).map((decision) => (
              <DecisionCard decision={decision} key={decision.platform} />
            ))}
          </div>
        </section>

        <section className="social-metrics" aria-label="Social overview">
          <div>
            <strong className="mono">{integer(followerTotal)}</strong>
            <span>Tracked followers</span>
          </div>
          <div>
            <strong className="mono">
              {integer(data?.status === 'ok' ? data.accounts.length : null)}
            </strong>
            <span>Follower telemetry channels</span>
          </div>
          <div>
            <strong className="mono">{integer(latest?.totalViews)}</strong>
            <span>Latest episode views</span>
          </div>
        </section>

        <section className="growth-section">
          <div className="section-heading">
            <h2>Follower growth by platform</h2>
            <span className="decision-note">
              Platform counts; lane attribution is estimated
            </span>
          </div>
          <div className="ledger-wrap">
            <table className="social-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Followers</th>
                  <th>Δ 24h</th>
                  <th>Δ 7d</th>
                  <th>Lane evidence</th>
                </tr>
              </thead>
              <tbody>
                {(props.growth?.platforms ?? []).map((platform) => (
                  <tr key={platform.platform}>
                    <td>{platformLabel(platform.platform)}</td>
                    <td className="mono">{integer(platform.followersNow)}</td>
                    <td className="mono">
                      {signed(platform.followersDelta24h)}
                    </td>
                    <td className="mono">
                      {platform.platform === 'youtube'
                        ? `${signed(platform.exactSubscribersGained7d)} exact`
                        : signed(platform.followersDelta7d)}
                    </td>
                    <td>
                      {platform.lanes
                        .map(
                          (lane) =>
                            `${lane.languageCode}: n=${lane.postCount7d}, ${decimal(lane.followersPer1kReach)} / 1k (${lane.basis})`,
                        )
                        .join(' · ') || 'No 7d posts'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="decision-section growth-section">
          <div className="section-heading">
            <h2>Growth experiments</h2>
            <span className="decision-note">No automatic winner selection</span>
          </div>
          <div className="decision-grid">
            {(props.growth?.experiments ?? []).map((experiment) => (
              <article className="decision-card" key={experiment.experimentKey}>
                <header>
                  <strong>{experiment.experimentKey}</strong>
                  <span className={`growth-status ${experiment.status}`}>
                    {experiment.paired
                      ? 'paired cohort — not an A/B test'
                      : experiment.status}
                  </span>
                </header>
                {experiment.arms.map((arm) => (
                  <div className="experiment-arm" key={arm.variant}>
                    <strong>{arm.variant}</strong>
                    <span>
                      n={arm.samples24h} · reach {decimal(arm.medianReach24h)}{' '}
                      median / {decimal(arm.meanReach24h)} mean · engagement{' '}
                      {percent(arm.medianEngagementRate)}
                    </span>
                    <small>
                      {decimal(arm.followersAttributed)} {arm.basis} followers ·{' '}
                      {decimal(arm.followersPer1kReach)} / 1k reach ·{' '}
                      {arm.status}
                    </small>
                  </div>
                ))}
                <small>
                  Interpret the evidence manually; this panel never declares a
                  winner.
                </small>
              </article>
            ))}
          </div>
        </section>

        <section className="performance-section growth-section">
          <div className="section-heading">
            <h2>Estimated attribution — never platform-reported truth</h2>
            <span className="decision-note">Recent follower intervals</span>
          </div>
          {(props.growth?.attribution ?? []).map((interval) => (
            <article
              className="episode-ledger"
              key={`${interval.platform}:${interval.startAt}:${interval.endAt}`}
            >
              <div className="episode-heading">
                <div>
                  <strong>{platformLabel(interval.platform)}</strong>
                  <small>
                    {interval.startAt} → {interval.endAt}
                  </small>
                </div>
                <span className="mono">
                  {signed(interval.netDelta)} net ·{' '}
                  {decimal(interval.unattributed)} unattributed
                </span>
              </div>
              <div className="attribution-shares">
                {interval.posts.map((post) => (
                  <span key={post.postId}>
                    {post.postId.slice(0, 8)} · {percent(post.share)} ·{' '}
                    {decimal(post.followersEstimated)} est.
                  </span>
                ))}
                {interval.posts.length === 0 ? (
                  <span>No attributable post activity</span>
                ) : null}
              </div>
            </article>
          ))}
        </section>

        <section className="performance-section">
          <h2>Evidence by recent episode</h2>
          {(data?.episodes ?? []).map((episode) => (
            <article className="episode-ledger" key={episode.episodeId}>
              <div className="episode-heading">
                <div>
                  <strong>{episode.title}</strong>
                  <small>{episode.episodeId}</small>
                </div>
                <span className="mono">
                  {integer(episode.totalViews)} views
                </span>
              </div>
              <div className="table-wrap">
                <table className="data-table episode-table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Views</th>
                      <th>Engagement</th>
                      <th>Decision signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* One episode can carry several posts on the same
                        platform — YouTube gets one per language — so the
                        platform alone is not a unique key. */}
                    {episode.platforms.map((platform, index) => (
                      <tr
                        key={`${episode.episodeId}:${platform.platform}:${platform.postUrl ?? index}`}
                      >
                        <td className="cell-title">
                          {platform.postUrl ? (
                            <a
                              href={platform.postUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {platformLabel(platform.platform)}
                            </a>
                          ) : (
                            platformLabel(platform.platform)
                          )}
                        </td>
                        <td className="mono">{integer(platform.views)}</td>
                        <td className="mono">
                          {percent(platform.engagementRate)}
                        </td>
                        <td>{platformSignal(platform)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
          {data?.episodes.length === 0 ? (
            <div className="social-empty">
              <strong>No social metric snapshots yet.</strong>
              <span>
                {data.message ??
                  'Keep pnpm social:daemon running to collect telemetry.'}
              </span>
            </div>
          ) : null}
        </section>
      </div>

      <aside className="followers-rail">
        <h2>Follower telemetry</h2>
        {(data?.accounts ?? []).map((account) => (
          <div className="follower-entry" key={account.platform}>
            <span>{platformLabel(account.platform)}</span>
            <strong className="mono">{integer(account.followers)}</strong>
            <small>Updated {relativeTime(account.capturedAt)}</small>
          </div>
        ))}
        {data?.accounts.length === 0 ? (
          <div className="empty-inline">No account snapshots available.</div>
        ) : null}
        <p>
          Missing platforms are collection gaps, not zero followers. Optimize
          posts from per-post evidence above instead.
        </p>
      </aside>
    </div>
  );
}

function DecisionCard({ decision }: { decision: SocialDecision }) {
  return (
    <article className="decision-card">
      <header>
        <strong>{platformLabel(decision.platform)}</strong>
        <span className={`confidence-${decision.confidence}`}>
          {decision.confidence} confidence
        </span>
      </header>
      <DecisionLine
        label="Hook"
        value={
          decision.preferredHookTypes.length
            ? decision.preferredHookTypes.join(' / ')
            : 'Keep exploring'
        }
      />
      <DecisionLine
        label="Schedule"
        value={
          decision.publishSlotsJst
            ? `${decision.publishSlotsJst} JST (fixed)`
            : 'Default slots'
        }
      />
      <DecisionLine
        label="Best topic evidence"
        value={
          decision.bestTopic
            ? `${decision.bestTopic} (n=${decision.bestTopicSamples})`
            : 'More samples needed'
        }
      />
      <DecisionLine
        label="Winning example"
        value={decision.topExample ?? 'More samples needed'}
      />
      {decision.platform === 'rednote' ? (
        <>
          <DecisionLine
            label="Prefer tags"
            value={decision.preferredHashtags.join(' · ') || 'Keep exploring'}
          />
          <DecisionLine
            label="Avoid tags"
            value={decision.avoidHashtags.join(' · ') || 'None yet'}
          />
        </>
      ) : null}
      <small>{decision.evidenceSamples} comparable 24h samples</small>
    </article>
  );
}

function DecisionLine(props: { label: string; value: string }) {
  return (
    <div className="decision-line">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function platformSignal(platform: SocialPlatformPerformance): string {
  if (platform.platform === 'rednote') {
    return `${integer(platform.saves)} saves · ${integer(platform.shares)} shares`;
  }
  if (platform.platform === 'youtube') {
    const watch =
      platform.averageViewPercentage === null
        ? duration(platform.averageViewDurationSec)
        : `${percent(platform.averageViewPercentage)} watched`;
    const subscribers =
      platform.followersGained === null
        ? ''
        : ` · ${platform.followersGained >= 0 ? '+' : ''}${platform.followersGained} subs`;
    return `${watch}${subscribers}`;
  }
  return `${integer(platform.shares)} shares · ${integer(platform.comments)} replies`;
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function signed(value: number | null): string {
  return value === null ? '—' : `${value >= 0 ? '+' : ''}${decimal(value)}`;
}

function decimal(value: number | null): string {
  return value === null
    ? '—'
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
