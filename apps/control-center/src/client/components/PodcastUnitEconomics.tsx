import type { PodcastCostResponse } from '../../shared/types.js';
import { usd } from '../format.js';

export function PodcastUnitEconomics(props: {
  data: PodcastCostResponse | null;
}) {
  return (
    <section className="open-panel costs-ledger">
      <div className="section-heading">
        <h2>Podcast unit economics</h2>
      </div>
      {!props.data ? (
        <div className="empty-row">Loading episode costs…</div>
      ) : props.data.status !== 'ok' ? (
        <div className="empty-row">
          {props.data.message ?? 'Podcast cost ledger unavailable.'}
        </div>
      ) : props.data.episodes.length === 0 ? (
        <div className="empty-row">No pipeline cost runs recorded yet.</div>
      ) : (
        <div className="ledger-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Episode</th>
                <th>Podcast</th>
                <th>Video</th>
                <th>Retry waste</th>
                <th>Total</th>
                <th>Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {props.data.episodes.map((episode) => (
                <tr key={episode.episodeId}>
                  <td>
                    <strong>{episode.title ?? shortId(episode.episodeId)}</strong>
                    <div className="mono">
                      {episode.runCount} runs
                      {episode.failedRuns > 0
                        ? ` · ${episode.failedRuns} failed`
                        : ''}
                    </div>
                  </td>
                  <td className="mono">{usd(episode.podcastCostUsd)}</td>
                  <td className="mono">{usd(episode.videoCostUsd)}</td>
                  <td className="mono">{usd(episode.retryWasteUsd)}</td>
                  <td className="mono actual">{usd(episode.totalCostUsd)}</td>
                  <td>
                    {episode.breakdown
                      .map(
                        (item) =>
                          `${item.label} ${usd(item.costUsd)}${
                            item.operations > 1 ? ` ×${item.operations}` : ''
                          }`,
                      )
                      .join(' · ') || '—'}
                    {episode.unpricedStages > 0
                      ? ` · ${episode.unpricedStages} unpriced`
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="empty-inline">
        Retry waste is already included in podcast/video totals. Shared Fly
        infrastructure stays in the provider ledger instead of being allocated
        to episodes.
      </div>
    </section>
  );
}

function shortId(value: string): string {
  return `Episode ${value.slice(0, 8)}`;
}
