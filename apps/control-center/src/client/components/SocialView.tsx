import type {
  SocialDecision,
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

export function SocialView(props: {
  data: SocialPerformanceResponse | null;
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
          <div className="section-heading">
            <h2>Publishing decisions</h2>
            <span className="decision-note">
              Learned from standardized 24h samples
            </span>
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
              <div className="ledger-wrap">
                <table className="social-table social-table-compact">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Views</th>
                      <th>Engagement</th>
                      <th>Decision signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {episode.platforms.map((platform) => (
                      <tr key={platform.platform}>
                        <td className="provider-name">
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
        label="Best time evidence"
        value={decision.bestTimeWindow ?? 'More samples needed'}
      />
      <DecisionLine
        label="Best topic evidence"
        value={decision.bestTopic ?? 'More samples needed'}
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
