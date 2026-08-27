import {
  formatCount,
  languageLabel,
  platformLabel,
  type DistributionSnapshot,
} from '@/data/distribution';

function total(
  channels: DistributionSnapshot['channels'],
  value: (channel: DistributionSnapshot['channels'][number]) => number,
): number {
  return channels.reduce((sum, channel) => sum + value(channel), 0);
}

export function DistributionChannels({
  snapshot,
}: {
  snapshot: DistributionSnapshot;
}) {
  const { channels } = snapshot;

  return (
    <section className="zp-section zp-section-alt" id="channels">
      <div className="zp-container">
        <p className="zp-kicker">Channels</p>
        <h2 className="zp-h2">Nine channels, each measured separately.</h2>
        <p className="zp-lede">
          A channel is one platform in one language, because that is the level
          the publishing strategy is tuned at. Reach is views where a platform
          reports them and impressions where it does not; a post whose metrics
          could not be read is counted as a post and left out of reach rather
          than recorded as a zero.
        </p>
        <div className="dist-scroll">
          <table className="dist-table">
            <thead>
              <tr>
                <th scope="col">Platform</th>
                <th scope="col">Language</th>
                <th scope="col">Posts</th>
                <th scope="col">Measured</th>
                <th scope="col">Reach</th>
                <th scope="col">Reactions</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={`${channel.platform}-${channel.language}`}>
                  <td>{platformLabel(channel.platform)}</td>
                  <td className="dist-table-muted">
                    {languageLabel(channel.language)}
                  </td>
                  <td>{formatCount(channel.posts)}</td>
                  <td className="dist-table-muted">
                    {formatCount(channel.postsWithMetrics)}
                  </td>
                  <td>{formatCount(channel.reach)}</td>
                  <td className="dist-table-muted">
                    {formatCount(
                      channel.likes + channel.comments + channel.shares,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>All channels</td>
                <td>{formatCount(total(channels, (c) => c.posts))}</td>
                <td>
                  {formatCount(total(channels, (c) => c.postsWithMetrics))}
                </td>
                <td>{formatCount(snapshot.funnel.reach)}</td>
                <td>
                  {formatCount(
                    total(channels, (c) => c.likes + c.comments + c.shares),
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
