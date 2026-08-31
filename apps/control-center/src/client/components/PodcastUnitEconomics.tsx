import type {
  PodcastCostBreakdown,
  PodcastCostResponse,
  PodcastEpisodeCostSummary,
} from '../../shared/types.js';
import { relativeTime, unitUsd } from '../format.js';

interface LanguageAverage {
  languageCode: string;
  audioCostUsd: number | null;
  videoCostUsd: number | null;
  audioEpisodes: number;
  videoEpisodes: number;
}

export function PodcastUnitEconomics(props: {
  data: PodcastCostResponse | null;
}) {
  const episodes = props.data?.status === 'ok' ? props.data.episodes : [];
  const productionAverage =
    props.data?.status === 'ok' && props.data.episodes.length > 0
      ? averageCosts(props.data)
      : null;
  const costSummary = summarize(episodes);
  const outlier = costSummary.highest;

  return (
    <section className="open-panel costs-ledger unit-cost-panel">
      <div className="section-heading">
        <div>
          <h2>Average production cost</h2>
          <span className="decision-note">
            What one published article costs, averaged across recent episodes
          </span>
        </div>
      </div>
      {!props.data ? (
        <div className="empty-row">Loading production costs…</div>
      ) : props.data.status !== 'ok' ? (
        <div className="empty-row">
          {props.data.message ?? 'Production cost data unavailable.'}
        </div>
      ) : props.data.episodes.length === 0 ? (
        <div className="empty-row">No production cost runs recorded yet.</div>
      ) : productionAverage ? (
        <>
          <div className="decision-metrics podcast-metrics">
            <DecisionMetric
              label="Average / episode"
              note={`${episodes.length} recent episodes`}
              value={unitUsd(costSummary.averageCostUsd)}
            />
            <DecisionMetric
              label="Retry waste"
              note={`${percentage(costSummary.retryWasteShare)} of episode cost`}
              tone={costSummary.retryWasteUsd > 0 ? 'warning' : undefined}
              value={unitUsd(costSummary.retryWasteUsd)}
            />
            <DecisionMetric
              label="Highest recent episode"
              note={
                outlier ? (outlier.title ?? shortId(outlier.episodeId)) : '—'
              }
              value={unitUsd(outlier?.totalCostUsd ?? null)}
            />
          </div>
          <div className="unit-cost-hero">
            <div>
              <span>Audio article</span>
              <strong>{unitUsd(productionAverage.audioCostUsd)}</strong>
              <small>average per episode</small>
            </div>
            <div>
              <span>Video article</span>
              <strong>{unitUsd(productionAverage.videoCostUsd)}</strong>
              <small>average per episode</small>
            </div>
          </div>
          <div className="language-cost-grid">
            {productionAverage.languages.map((language) => (
              <article key={language.languageCode}>
                <header>{languageLabel(language.languageCode)}</header>
                <CostLine
                  count={language.audioEpisodes}
                  label="Audio"
                  value={language.audioCostUsd}
                />
                <CostLine
                  count={language.videoEpisodes}
                  label="Video"
                  value={language.videoCostUsd}
                />
              </article>
            ))}
          </div>
          {outlier ? (
            <div className="podcast-episode-list podcast-outlier-audit">
              <div className="podcast-list-head" aria-hidden="true">
                <span>Highest-cost episode audit</span>
                <span>Total</span>
                <span>Retry</span>
                <span>Runs</span>
              </div>
              <EpisodeCostRow
                episode={outlier}
                maxCostUsd={costSummary.maxCostUsd}
              />
            </div>
          ) : null}
        </>
      ) : null}
      <div className="unit-cost-note">
        Based on {props.data?.episodes.length ?? 0} recent episode
        {(props.data?.episodes.length ?? 0) === 1 ? '' : 's'}. Failed-attempt
        spend is included; unpriced stages are excluded.
      </div>
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

function CostLine(props: {
  count: number;
  label: string;
  value: number | null;
}) {
  return (
    <div className="language-cost-line">
      <span>{props.label}</span>
      <strong className="mono">{unitUsd(props.value)}</strong>
      <small>
        {props.count > 0
          ? `${props.count} episode${props.count === 1 ? '' : 's'}`
          : 'no priced runs'}
      </small>
    </div>
  );
}

function averageCosts(data: PodcastCostResponse): {
  audioCostUsd: number;
  videoCostUsd: number;
  languages: LanguageAverage[];
} {
  const count = data.episodes.length;
  const languages = new Map<
    string,
    {
      audioCostUsd: number;
      videoCostUsd: number;
      audioEpisodes: Set<string>;
      videoEpisodes: Set<string>;
    }
  >();

  for (const episode of data.episodes) {
    for (const item of episode.breakdown) {
      const parsed = parseLanguageBreakdown(item);
      if (!parsed) {
        continue;
      }
      const current = languages.get(parsed.languageCode) ?? {
        audioCostUsd: 0,
        videoCostUsd: 0,
        audioEpisodes: new Set<string>(),
        videoEpisodes: new Set<string>(),
      };
      if (parsed.kind === 'video') {
        current.videoCostUsd += item.costUsd;
        current.videoEpisodes.add(episode.episodeId);
      } else {
        current.audioCostUsd += item.costUsd;
        current.audioEpisodes.add(episode.episodeId);
      }
      languages.set(parsed.languageCode, current);
    }
  }

  return {
    audioCostUsd:
      data.episodes.reduce(
        (total, episode) => total + episode.podcastCostUsd,
        0,
      ) / count,
    videoCostUsd:
      data.episodes.reduce(
        (total, episode) => total + episode.videoCostUsd,
        0,
      ) / count,
    languages: [...languages.entries()]
      .map(([languageCode, totals]) => ({
        languageCode,
        audioCostUsd:
          totals.audioEpisodes.size > 0
            ? totals.audioCostUsd / totals.audioEpisodes.size
            : null,
        videoCostUsd:
          totals.videoEpisodes.size > 0
            ? totals.videoCostUsd / totals.videoEpisodes.size
            : null,
        audioEpisodes: totals.audioEpisodes.size,
        videoEpisodes: totals.videoEpisodes.size,
      }))
      .sort(
        (left, right) =>
          languageOrder(left.languageCode) - languageOrder(right.languageCode),
      ),
  };
}

function parseLanguageBreakdown(item: PodcastCostBreakdown): {
  languageCode: string;
  kind: 'audio' | 'video';
} | null {
  const match = /^(en|ja|zh-Hant|zh-Hans)\s+(.+)$/.exec(item.label);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    languageCode: match[1],
    kind: match[2].includes('render') ? 'video' : 'audio',
  };
}

function languageOrder(code: string): number {
  return ['en', 'ja', 'zh-Hant', 'zh-Hans'].indexOf(code);
}

function languageLabel(code: string): string {
  return (
    {
      en: 'English',
      ja: 'Japanese',
      'zh-Hant': 'Traditional Chinese',
      'zh-Hans': 'Simplified Chinese',
    }[code] ?? code
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
