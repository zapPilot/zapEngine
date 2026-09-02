import type { StatementsResponse } from '../../shared/statements.js';
import type {
  SocialDecision,
  SocialEpisodeSummary,
  SocialGrowthLane,
  SocialGrowthResponse,
  SocialPerformanceResponse,
  SocialPlatformPerformance,
} from '../../shared/types.js';
import { duration, integer, percent, relativeTime } from '../format.js';
import { platformLabel } from '../platform.js';
import { StatementHeader } from './StatementHeader.js';

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
  const brief = buildPublishingBrief(data?.decisions ?? []);
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
          <section
            className="publishing-brief"
            aria-label="Next publishing plan"
          >
            <div className="brief-kicker">Next publishing plan</div>
            <div className="brief-primary">
              <span>Publish every platform together at</span>
              <strong>{brief.time}</strong>
              <small>{brief.timeBasis}</small>
            </div>
            <div className="brief-direction">
              <span>What to write next</span>
              <strong>{brief.topic}</strong>
              <p>{brief.topicAdvice}</p>
            </div>
          </section>

          <LatestEpisodePanel episode={latestEpisode} />
        </div>

        <section className="decision-section">
          <div className="section-head">
            <h2>What to publish next</h2>
            <small className="panel-note">
              One article direction, packaged for how each audience reads
            </small>
          </div>
          <div className="platform-playbook">
            {(data?.decisions ?? []).map((decision) => (
              <PlatformPlaybook
                decision={decision}
                key={decision.platform}
                lane={bestLanguageLane(props.growth, decision.platform)}
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
                  <strong>{platformLabel(platform.platform)}</strong>
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
              </div>
            </section>

            <section className="disclosure-section">
              <div className="panel-head">
                <h2>Evidence by recent episode</h2>
                <small className="panel-note">
                  Audit the recommendation only when the aggregate decision
                  looks surprising
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
                              <td className="mono">
                                {integer(platform.views)}
                              </td>
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
          from the playbook; open the evidence only when you need to audit the
          recommendation.
        </p>
      </aside>
    </div>
  );
}

function LatestEpisodePanel(props: { episode: SocialEpisodeSummary | null }) {
  const episode = props.episode;
  const max = episode
    ? Math.max(1, ...episode.platforms.map((platform) => platform.views ?? 0))
    : 1;
  return (
    <section className="panel latest-episode-panel">
      <div className="panel-head">
        <h2>Latest episode · 24h</h2>
        <small className="panel-note">
          {episode?.title ?? 'Waiting for data'}
        </small>
      </div>
      <div className="latest-episode-rows">
        {episode?.platforms.map((platform) => (
          <div className="latest-episode-row" key={platform.platform}>
            <span>{platformLabel(platform.platform)}</span>
            <span className="latest-episode-track">
              <i style={{ width: `${((platform.views ?? 0) / max) * 100}%` }} />
            </span>
            <strong>{integer(platform.views)}</strong>
            <span className="latest-episode-signal">
              {platformSignal(platform)}
            </span>
          </div>
        ))}
        {episode && episode.platforms.length === 0 ? (
          <div className="empty-inline">No per-platform metrics yet.</div>
        ) : null}
        {episode ? null : (
          <div className="empty-inline">No episode metrics yet.</div>
        )}
      </div>
    </section>
  );
}

function PlatformPlaybook(props: {
  decision: SocialDecision;
  lane: SocialGrowthLane | null;
}) {
  const { decision, lane } = props;
  return (
    <article className="playbook-card">
      <header>
        <strong>{platformLabel(decision.platform)}</strong>
        <span className={`confidence-${decision.confidence}`}>
          {decision.evidenceSamples} samples
        </span>
      </header>
      <div className="playbook-language">
        <span>Use</span>
        <strong>
          {lane ? languageLabel(lane.languageCode) : 'Keep testing'}
        </strong>
        <small>
          {lane
            ? `${lane.languageCode} · ${decimal(lane.followersPer1kReach)} / 1k ${lane.basis} follower conversion · ${lane.postCount7d} posts`
            : 'Not enough language evidence yet'}
        </small>
      </div>
      <div className="playbook-title">
        <span>Shape the title like this</span>
        <strong>{titleDirection(decision)}</strong>
      </div>
      <div className="playbook-evidence">
        <span>Next article</span>
        <strong>
          {decision.bestTopic
            ? `Prioritize ${decision.bestTopic}`
            : 'Keep exploring topics'}
        </strong>
        <small>{topicEvidence(decision)}</small>
      </div>
      {decision.platform === 'rednote' &&
      decision.preferredHashtags.length > 0 ? (
        <div className="playbook-tags">
          {decision.preferredHashtags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function buildPublishingBrief(decisions: SocialDecision[]): {
  time: string;
  timeBasis: string;
  topic: string;
  topicAdvice: string;
} {
  const slots = new Map<string, { platforms: number; weight: number }>();
  for (const decision of decisions) {
    const times = decision.publishSlotsJst?.match(/\d{1,2}:\d{2}/g) ?? [];
    for (const time of new Set(times)) {
      const current = slots.get(time) ?? { platforms: 0, weight: 0 };
      current.platforms += 1;
      current.weight += decision.evidenceSamples;
      slots.set(time, current);
    }
  }
  const bestTime = [...slots.entries()].sort(
    (left, right) =>
      right[1].platforms - left[1].platforms ||
      right[1].weight - left[1].weight ||
      left[0].localeCompare(right[0]),
  )[0];

  const topics = new Map<string, number>();
  for (const decision of decisions) {
    if (decision.bestTopic) {
      topics.set(
        decision.bestTopic,
        (topics.get(decision.bestTopic) ?? 0) +
          (decision.bestTopicSamples ?? 0),
      );
    }
  }
  const bestTopic = [...topics.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0];

  return {
    time: bestTime ? `${bestTime[0]} JST` : 'Use the next regular slot',
    timeBasis: bestTime
      ? `The strongest shared slot across ${bestTime[1].platforms} platform${bestTime[1].platforms === 1 ? '' : 's'}`
      : 'No cross-platform timing winner yet',
    topic: bestTopic ? topicLabel(bestTopic[0]) : 'Keep the next topic broad',
    topicAdvice: bestTopic
      ? `The clearest repeatable signal is ${topicLabel(bestTopic[0]).toLowerCase()}. Lead with one concrete consequence, then explain why the consensus view misses it.`
      : 'There is not enough repeated topic evidence yet. Publish the same article everywhere and keep the angle easy to compare.',
  };
}

function bestLanguageLane(
  growth: SocialGrowthResponse | null,
  platform: string,
): SocialGrowthLane | null {
  const lanes =
    growth?.platforms.find((item) => item.platform === platform)?.lanes ?? [];
  return (
    lanes
      .filter((lane) => lane.postCount7d > 0 && lane.medianReach24h !== null)
      .sort(
        (left, right) =>
          (right.medianReach24h ?? -1) - (left.medianReach24h ?? -1) ||
          right.postCount7d - left.postCount7d,
      )[0] ?? null
  );
}

function bestLaneEfficiency(lanes: SocialGrowthLane[]): string {
  const best = lanes
    .filter(
      (lane): lane is SocialGrowthLane & { followersPer1kReach: number } =>
        lane.followersPer1kReach !== null,
    )
    .sort(
      (left, right) => right.followersPer1kReach - left.followersPer1kReach,
    )[0];
  return best
    ? `${best.languageCode} · ${decimal(best.followersPer1kReach)} / 1k (${best.basis})`
    : 'No language conversion signal yet';
}

function topicEvidence(decision: SocialDecision): string {
  if (
    !decision.bestTopic ||
    decision.bestTopicMedian24hViews === null ||
    decision.bestTopicSamples === null
  ) {
    return decision.platformMedian24hViews === null
      ? 'No comparable 24h evidence yet'
      : `Platform median ${decimal(decision.platformMedian24hViews)} views; more topic samples needed`;
  }

  const platformMedian =
    decision.platformMedian24hViews === null
      ? ''
      : ` · platform median ${decimal(decision.platformMedian24hViews)}`;
  const lift =
    decision.bestTopicLiftVsPlatformMedian === null
      ? ''
      : ` · ${decimal(decision.bestTopicLiftVsPlatformMedian)}× lift`;
  return `${decimal(decision.bestTopicMedian24hViews)} median 24h views · n=${decision.bestTopicSamples}${platformMedian}${lift}`;
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

function titleDirection(decision: SocialDecision): string {
  const hook = decision.preferredHookTypes[0];
  if (hook === 'surprising_number') {
    return 'Open with the strongest number, then say what it changes.';
  }
  if (hook === 'contrarian') {
    return 'State the common belief first, then overturn it with the consequence.';
  }
  if (hook === 'question') {
    return 'Ask the decision the reader is already facing, then answer it plainly.';
  }
  if (hook) {
    return `Lead with ${hook.replaceAll('_', ' ')}, then name the practical consequence.`;
  }
  return 'Lead with one concrete consequence, not a generic topic label.';
}

function topicLabel(topic: string): string {
  return topic.replaceAll('_', ' ');
}

function languageLabel(code: string): string {
  const labels: Record<string, string> = {
    en: 'English',
    ja: 'Japanese',
    'zh-Hant': 'Traditional Chinese',
    'zh-Hans': 'Simplified Chinese',
  };
  return labels[code] ?? code;
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
