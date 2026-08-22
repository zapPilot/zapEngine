import type { SocialPerformanceResponse } from '../../shared/types.js';
import { duration, integer, percent, relativeTime } from '../format.js';

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
  const latestReach = latest?.totalImpressions ?? latest?.totalViews;

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
        <section className="social-metrics" aria-label="Social overview">
          <div>
            <strong className="mono">{integer(followerTotal)}</strong>
            <span>Total followers</span>
          </div>
          <div>
            <strong className="mono">
              {integer(data?.status === 'ok' ? data.accounts.length : null)}
            </strong>
            <span>Active channels</span>
          </div>
          <div>
            <strong className="mono">{integer(latestReach)}</strong>
            <span>Latest episode reach</span>
          </div>
        </section>

        <section className="performance-section">
          <h2>Performance by recent episode</h2>
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
                <table className="social-table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Views</th>
                      <th>Impressions</th>
                      <th>Engagement rate</th>
                      <th>5s retention</th>
                      <th>Avg watch</th>
                      <th>Cover CTR</th>
                      <th>Quality</th>
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
                          {integer(platform.impressions)}
                        </td>
                        <td className="mono">
                          {percent(platform.engagementRate)}
                        </td>
                        <td className="mono">
                          {percent(platform.fiveSecondRetentionRate)}
                        </td>
                        <td className="mono">
                          {duration(platform.averageViewDurationSec)}
                        </td>
                        <td className="mono">{percent(platform.coverCtr)}</td>
                        <td className="mono quality">
                          {platform.technicalQualityScore === null
                            ? '—'
                            : `${Math.round(platform.technicalQualityScore)}/100`}
                        </td>
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
        <h2>Followers</h2>
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
        <p>Follower counts update on each platform’s collection cadence.</p>
      </aside>
    </div>
  );
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    x: 'X',
    rednote: 'Rednote',
    youtube: 'YouTube',
    threads: 'Threads',
  };
  return labels[platform] ?? platform;
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}
