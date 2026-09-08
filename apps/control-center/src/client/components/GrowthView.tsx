import type { StatementsResponse } from '../../shared/statements.js';
import type {
  SocialEpisodeSummary,
  SocialGrowthLane,
  SocialGrowthResponse,
  SocialPerformanceResponse,
  SocialPlatformPerformance,
} from '../../shared/types.js';
import { duration, integer, percent, relativeTime } from '../format.js';
import { PlatformIdentity } from '../platform.js';
import { StatementHeader } from './StatementHeader.js';

export const CURRENT_RELEASE_SLOTS_JST = ['09:30', '12:00', '16:00'] as const;

const PLATFORM_ORDER = ['x', 'threads', 'rednote', 'youtube'] as const;

export function GrowthView(props: {
  data: SocialPerformanceResponse | null;
  growth: SocialGrowthResponse | null;
  onWindowChange: (
    window: SocialPerformanceResponse['window'],
  ) => Promise<void>;
  statements?: StatementsResponse | null;
}) {
  const data = props.data;
  const followerTotal = sumKnown(
    data?.accounts.map((account) => account.followers) ?? [],
  );
  const header = props.statements?.headers.find((h) => h.domain === 'growth');
  const latestEpisode = data?.episodes[0] ?? null;

  return (
    <div className="social-layout social-layout-focused">
      <div className="social-main">
        {header ? (
          <StatementHeader
            facts={header.facts}
            sentence={header.sentence}
            status={header.status}
          />
        ) : null}

        <div className="growth-plan-row">
          <PublishingCadence />
          <LatestEpisodePanel
            episode={latestEpisode}
            window={data?.window ?? 'latest'}
          />
        </div>

        <section className="decision-section">
          <div className="section-head">
            <h2>Language performance</h2>
            <small className="panel-note">
              Same article everywhere · language is the only lane-level variable
            </small>
          </div>
          <div className="platform-playbook">
            {(props.growth?.platforms ?? []).map((platform) => (
              <LanguagePerformanceCard
                key={platform.platform}
                platform={platform}
              />
            ))}
          </div>
        </section>

        <section className="growth-section growth-summary-section">
          <div className="section-heading">
            <h2>Audience pulse</h2>
            <span className="decision-note">
              Follower totals and recent movement
            </span>
          </div>
          <div className="audience-grid">
            {(props.growth?.platforms ?? []).map((platform) => (
              <article className="audience-card" key={platform.platform}>
                <div>
                  <strong>
                    <PlatformIdentity platform={platform.platform} />
                  </strong>
                  <span>{integer(platform.followersNow)} followers</span>
                  <small>{bestLaneEfficiency(platform.lanes)}</small>
                </div>
                <div className="audience-deltas">
                  <span>
                    <small>24h</small>
                    <strong>{signed(platform.followersDelta24h)}</strong>
                  </span>
                  <span>
                    <small>7d</small>
                    <strong>
                      {platform.platform === 'youtube'
                        ? signed(platform.exactSubscribersGained7d)
                        : signed(platform.followersDelta7d)}
                    </strong>
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <details className="panel decision-disclosure growth-evidence">
          <summary className="decision-disclosure-summary">
            <span>
              <strong>Research &amp; evidence</strong>
              <small>
                Experiments, estimated attribution, and episode-level metrics
              </small>
            </span>
          </summary>
          <div className="decision-disclosure-body">
            <section className="disclosure-section">
              <div className="panel-head">
                <h2>Growth experiments</h2>
                <small className="panel-note">
                  No automatic winner selection
                </small>
              </div>
              <div className="decision-grid disclosure-grid">
                {(props.growth?.experiments ?? []).map((experiment) => (
                  <article
                    className="decision-card"
                    key={experiment.experimentKey}
                  >
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
                          n={arm.samples24h} · reach{' '}
                          {decimal(arm.medianReach24h)} median /{' '}
                          {decimal(arm.meanReach24h)} mean · engagement{' '}
                          {percent(arm.medianEngagementRate)}
                        </span>
                        <small>
                          {decimal(arm.followersAttributed)} {arm.basis}{' '}
                          followers · {decimal(arm.followersPer1kReach)} / 1k
                          reach · {arm.status}
                        </small>
                      </div>
                    ))}
                    <small>
                      Interpret the evidence manually; this panel never declares
                      a winner.
                    </small>
                  </article>
                ))}
                {props.growth && props.growth.experiments.length === 0 ? (
                  <div className="empty-inline">No active experiments.</div>
                ) : null}
              </div>
            </section>

            <section className="disclosure-section">
              <div className="panel-head">
                <h2>Estimated attribution</h2>
                <small className="panel-note">
                  Recent follower intervals — never platform-reported truth
                </small>
              </div>
              <div className="evidence-stack">
                {(props.growth?.attribution ?? []).map((interval) => (
                  <article
                    className="episode-ledger"
                    key={`${interval.platform}:${interval.startAt}:${interval.endAt}`}
                  >
                    <div className="episode-heading">
                      <div>
                        <strong>
                          <PlatformIdentity platform={interval.platform} />
                        </strong>
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
              </div>
            </section>

            <section className="disclosure-section">
              <div className="panel-head">
                <h2>Evidence by recent episode</h2>
                <small className="panel-note">
                  Audit language signals when the aggregate comparison looks
                  surprising
                </small>
              </div>
              <div className="evidence-stack">
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
                          {orderedPlatforms(episode.platforms).map(
                            (platform, index) => (
                              <tr
                                key={`${episode.episodeId}:${platform.platform}:${platform.postUrl ?? index}`}
                              >
                                <td className="cell-title">
                                  <PlatformLink platform={platform} />
                                </td>
                                <td className="mono">
                                  {integer(platform.views)}
                                </td>
                                <td className="mono">
                                  {percent(platform.engagementRate)}
                                </td>
                                <td>{platformSignal(platform)}</td>
                              </tr>
                            ),
                          )}
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
              </div>
            </section>
          </div>
        </details>
      </div>

      <aside className="followers-rail">
        <h2>Collection status</h2>
        <div className="collection-total">
          <strong className="mono">{integer(followerTotal)}</strong>
          <span>tracked followers</span>
        </div>
        {(data?.accounts ?? []).map((account) => (
          <div className="follower-entry" key={account.platform}>
            <span>
              <PlatformIdentity platform={account.platform} />
            </span>
            <strong className="mono">{integer(account.followers)}</strong>
            <small>Updated {relativeTime(account.capturedAt)}</small>
          </div>
        ))}
        {data?.accounts.length === 0 ? (
          <div className="empty-inline">No account snapshots available.</div>
        ) : null}
        <p>
          Missing platforms are collection gaps, not zero followers. Compare
          language performance; open the evidence only when you need to audit
          the signal.
        </p>
      </aside>
    </div>
  );
}

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

function LatestEpisodePanel(props: {
  episode: SocialEpisodeSummary | null;
  window: SocialPerformanceResponse['window'];
}) {
  const episode = props.episode;
  const platforms = orderedPlatforms(episode?.platforms ?? []);
  const max = Math.max(1, ...platforms.map((platform) => platform.views ?? 0));
  return (
    <section className="panel latest-episode-panel">
      <div className="panel-head">
        <h2>最新一集表現 · {windowLabel(props.window)}</h2>
        <small className="panel-note">{episode?.title ?? '等待發布資料'}</small>
      </div>
      <div className="latest-episode-rows">
        {platforms.map((platform) => (
          <div className="latest-episode-row" key={platform.platform}>
            <span>
              <PlatformLink platform={platform} />
            </span>
            <span className="latest-episode-track">
              <i style={{ width: `${((platform.views ?? 0) / max) * 100}%` }} />
            </span>
            <strong>
              {platform.views === null
                ? '尚未取得'
                : `${integer(platform.views)} views`}
            </strong>
            <span className="latest-episode-signal">
              {platform.views === null
                ? 'Metrics unavailable'
                : platformSignal(platform)}
            </span>
          </div>
        ))}
        {episode && platforms.length === 0 ? (
          <div className="empty-inline">尚未取得各平台資料。</div>
        ) : null}
        {episode ? null : (
          <div className="empty-inline">尚未取得最新一集資料。</div>
        )}
      </div>
    </section>
  );
}

function PlatformLink(props: { platform: SocialPlatformPerformance }) {
  return props.platform.postUrl ? (
    <a href={props.platform.postUrl} rel="noreferrer" target="_blank">
      <PlatformIdentity platform={props.platform.platform} /> ↗
    </a>
  ) : (
    <PlatformIdentity platform={props.platform.platform} />
  );
}

function LanguagePerformanceCard(props: {
  platform: SocialGrowthResponse['platforms'][number];
}) {
  const leader = bestLanguageLane(props.platform.lanes);
  return (
    <article className="playbook-card">
      <header>
        <strong>
          <PlatformIdentity platform={props.platform.platform} />
        </strong>
        <span>{props.platform.lanes.length} language lanes</span>
      </header>
      <div className="playbook-language">
        <span>Current leader</span>
        <strong>
          {leader ? languageLabel(leader.languageCode) : 'Not enough evidence'}
        </strong>
        <small>
          {leader
            ? `${leader.postCount7d} posts in 7d · ${leader.basis} follower attribution`
            : 'Keep collecting comparable language samples'}
        </small>
      </div>
      <div className="playbook-evidence">
        <span>Follower conversion</span>
        <strong>
          {leader ? `${decimal(leader.followersPer1kReach)} / 1k reach` : '—'}
        </strong>
        <small>
          {leader
            ? `${decimal(leader.medianReach24h)} median 24h reach · ${decimal(leader.followersGained7d)} followers gained`
            : 'No comparable 24h language evidence yet'}
        </small>
      </div>
    </article>
  );
}

function bestLanguageLane(lanes: SocialGrowthLane[]): SocialGrowthLane | null {
  return (
    [...lanes]
      .filter((lane) => lane.postCount7d > 0)
      .sort(
        (left, right) =>
          (right.followersPer1kReach ?? -1) -
            (left.followersPer1kReach ?? -1) ||
          (right.medianReach24h ?? -1) - (left.medianReach24h ?? -1) ||
          right.postCount7d - left.postCount7d,
      )[0] ?? null
  );
}

function bestLaneEfficiency(lanes: SocialGrowthLane[]): string {
  const best = bestLanguageLane(lanes);
  return best
    ? `${languageCodeLabel(best.languageCode)} · ${decimal(best.followersPer1kReach)} / 1k (${best.basis})`
    : 'No language conversion signal yet';
}

function orderedPlatforms(
  platforms: SocialPlatformPerformance[],
): SocialPlatformPerformance[] {
  const order = new Map(
    PLATFORM_ORDER.map((platform, index) => [platform, index]),
  );
  return [...platforms].sort(
    (left, right) =>
      (order.get(left.platform as (typeof PLATFORM_ORDER)[number]) ?? 99) -
      (order.get(right.platform as (typeof PLATFORM_ORDER)[number]) ?? 99),
  );
}

function windowLabel(window: SocialPerformanceResponse['window']): string {
  if (window === 'latest') {
    return '最新快照';
  }
  return window;
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

function languageLabel(code: string): string {
  const labels: Record<string, string> = {
    en: '🇺🇸 English',
    ja: '🇯🇵 Japanese',
    'zh-Hant': '🇹🇼 Traditional Chinese',
    'zh-Hans': '🇨🇳 Simplified Chinese',
  };
  return labels[code] ?? code;
}

function languageCodeLabel(code: string): string {
  const flags: Record<string, string> = {
    en: '🇺🇸',
    ja: '🇯🇵',
    'zh-Hant': '🇹🇼',
    'zh-Hans': '🇨🇳',
  };
  return `${flags[code] ?? '🌐'} ${code}`;
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function signed(value: number | null): string {
  return value === null
    ? '—'
    : `${value >= 0 ? '+' : ''}${value.toLocaleString('en-US', {
        maximumFractionDigits: 2,
      })}`;
}

function decimal(value: number | null): string {
  return value === null
    ? '—'
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
