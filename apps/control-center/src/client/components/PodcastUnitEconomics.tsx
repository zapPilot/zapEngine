import type {
  PodcastCostResponse,
  PodcastEpisodeCostSummary,
} from '../../shared/types.js';
import { relativeTime, unitUsd } from '../format.js';

const EPISODE_PREVIEW = 8;

export function PodcastUnitEconomics(props: {
  data: PodcastCostResponse | null;
}) {
  const episodes = props.data?.status === 'ok' ? props.data.episodes : [];
  const summary = summarize(episodes);
  const preview = episodes.slice(0, EPISODE_PREVIEW);

  return (
    <section className="panel podcast-economics">
      <div className="panel-head">
        <h2>Podcast unit economics</h2>
        <small className="panel-note">
          Is one episode getting expensive, and are failed attempts wasting
          money?
        </small>
      </div>

      {!props.data ? (
        <div className="empty-inline">Loading episode costs…</div>
      ) : props.data.status !== 'ok' ? (
        <div className="empty-inline">
          {props.data.message ?? 'Podcast cost ledger unavailable.'}
        </div>
      ) : episodes.length === 0 ? (
        <div className="empty-inline">No pipeline cost runs recorded yet.</div>
      ) : (
        <>
          <div className="decision-metrics podcast-metrics">
            <DecisionMetric
              label="Average / episode"
              note={`${episodes.length} recent episodes`}
              value={unitUsd(summary.averageCostUsd)}
            />
            <DecisionMetric
              label="Retry waste"
              note={`${percentage(summary.retryWasteShare)} of episode cost`}
              tone={summary.retryWasteUsd > 0 ? 'warning' : undefined}
              value={unitUsd(summary.retryWasteUsd)}
            />
            <DecisionMetric
              label="Highest recent episode"
              note={
                summary.highest
                  ? (summary.highest.title ??
                    shortId(summary.highest.episodeId))
                  : '—'
              }
              value={unitUsd(summary.highest?.totalCostUsd ?? null)}
            />
          </div>

          <div className="podcast-episode-list">
            <div className="podcast-list-head" aria-hidden="true">
              <span>Recent episode</span>
              <span>Total</span>
              <span>Retry</span>
              <span>Runs</span>
            </div>
            {preview.map((episode) => (
              <EpisodeCostRow
                episode={episode}
                key={episode.episodeId}
                maxCostUsd={summary.maxCostUsd}
              />
            ))}
          </div>

          {episodes.length > preview.length ? (
            <div className="panel-foot podcast-preview-note">
              Showing the {preview.length} most recent episodes of{' '}
              {episodes.length}.
            </div>
          ) : null}
        </>
      )}

      <small className="table-footnote">
        Retry waste is already included in podcast/video totals. Shared Fly
        infrastructure stays in the provider ledger instead of being allocated
        to episodes. Expand an episode only when you need the stage-level audit.
      </small>
    </section>
  );
}

function EpisodeCostRow(props: {
  episode: PodcastEpisodeCostSummary;
  maxCostUsd: number;
}) {
  const { episode } = props;
  const barWidth =
    props.maxCostUsd > 0
      ? Math.max(2, (episode.totalCostUsd / props.maxCostUsd) * 100)
      : 0;
  return (
    <details className="podcast-episode">
      <summary className="podcast-episode-summary">
        <span className="podcast-episode-title">
          <strong>{episode.title ?? shortId(episode.episodeId)}</strong>
          <small>{relativeTime(episode.lastRunAt)}</small>
        </span>
        <strong className="mono podcast-total">
          {unitUsd(episode.totalCostUsd)}
        </strong>
        <span
          className={
            episode.retryWasteUsd > 0
              ? 'mono podcast-retry warning-text'
              : 'mono podcast-retry'
          }
        >
          {unitUsd(episode.retryWasteUsd)}
        </span>
        <span className="mono podcast-runs">
          {episode.runCount}
          {episode.failedRuns > 0 ? ` · ${episode.failedRuns} failed` : ''}
        </span>
        <span className="podcast-cost-track" aria-hidden="true">
          <i style={{ width: `${barWidth}%` }} />
        </span>
      </summary>

      <div className="podcast-episode-detail">
        <div className="podcast-component-costs">
          <DetailMetric
            label="Podcast"
            value={unitUsd(episode.podcastCostUsd)}
          />
          <DetailMetric label="Video" value={unitUsd(episode.videoCostUsd)} />
          <DetailMetric
            label="Retry waste"
            value={unitUsd(episode.retryWasteUsd)}
          />
        </div>
        <div className="podcast-breakdown">
          <strong>Stage breakdown</strong>
          <div className="podcast-breakdown-items">
            {episode.breakdown.map((item) => (
              <span key={item.label}>
                {item.label} · {unitUsd(item.costUsd)}
                {item.operations > 1 ? ` ×${item.operations}` : ''}
              </span>
            ))}
            {episode.breakdown.length === 0 ? (
              <span>No priced stages</span>
            ) : null}
            {episode.unpricedStages > 0 ? (
              <span className="warning-text">
                {episode.unpricedStages} unpriced stage
                {episode.unpricedStages === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </details>
  );
}

function DecisionMetric(props: {
  label: string;
  note: string;
  tone?: 'warning';
  value: string;
}) {
  return (
    <div className="decision-metric">
      <span>{props.label}</span>
      <strong className={props.tone === 'warning' ? 'warning-text' : undefined}>
        {props.value}
      </strong>
      <small>{props.note}</small>
    </div>
  );
}

function DetailMetric(props: { label: string; value: string }) {
  return (
    <div>
      <span>{props.label}</span>
      <strong className="mono">{props.value}</strong>
    </div>
  );
}

function summarize(episodes: PodcastEpisodeCostSummary[]): {
  averageCostUsd: number | null;
  highest: PodcastEpisodeCostSummary | null;
  maxCostUsd: number;
  retryWasteShare: number | null;
  retryWasteUsd: number;
} {
  if (episodes.length === 0) {
    return {
      averageCostUsd: null,
      highest: null,
      maxCostUsd: 0,
      retryWasteShare: null,
      retryWasteUsd: 0,
    };
  }
  const totalCostUsd = episodes.reduce(
    (total, episode) => total + episode.totalCostUsd,
    0,
  );
  const retryWasteUsd = episodes.reduce(
    (total, episode) => total + episode.retryWasteUsd,
    0,
  );
  const highest = episodes.reduce((current, episode) =>
    episode.totalCostUsd > current.totalCostUsd ? episode : current,
  );
  return {
    averageCostUsd: totalCostUsd / episodes.length,
    highest,
    maxCostUsd: highest.totalCostUsd,
    retryWasteShare: totalCostUsd > 0 ? retryWasteUsd / totalCostUsd : null,
    retryWasteUsd,
  };
}

function percentage(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 1,
    style: 'percent',
  });
}

function shortId(value: string): string {
  return `Episode ${value.slice(0, 8)}`;
}
