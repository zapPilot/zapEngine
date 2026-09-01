import { RotateCcw } from 'lucide-react';

import type {
  PodcastPipelineEpisode,
  PodcastPipelineJobState,
  PodcastPipelineResponse,
  PodcastPipelineStatus,
} from '../../shared/podcast-pipeline.js';
import { relativeTime } from '../format.js';

export function PodcastPipelineView(props: {
  data: PodcastPipelineResponse | null;
  restartingEpisodeId: string | null;
  onRestartVideo: (episodeId: string) => void;
}) {
  if (!props.data) {
    return <div className="empty-row">Loading podcast pipeline…</div>;
  }
  if (props.data.status !== 'ok') {
    return (
      <div className="empty-row">
        {props.data.message ?? 'Podcast pipeline unavailable.'}
      </div>
    );
  }

  const active = props.data.episodes.filter(
    ({ currentPhase }) => currentPhase !== 'done',
  );
  const recentlyCompleted = props.data.episodes
    .filter(({ currentPhase }) => currentPhase === 'done')
    .slice(0, 5);
  const failed = active.filter((episode) => hasFailure(episode));
  const stuck = active.filter((episode) => hasStuckWork(episode));

  return (
    <div className="pipeline-view">
      <section className="open-panel">
        <div className="section-heading">
          <div>
            <h2>Content production</h2>
            <span className="decision-note">
              Translation → TTS → visual planning → three-language video render
            </span>
          </div>
        </div>
        <div className="pipeline-summary">
          <Summary label="Active" value={active.length} />
          <Summary label="Failed" value={failed.length} tone="failed" />
          <Summary label="Stuck" value={stuck.length} tone="failed" />
        </div>
      </section>

      <section className="pipeline-list" aria-label="Podcast production status">
        {active.length === 0 ? (
          <div className="empty-row">No active podcast production work.</div>
        ) : (
          active.map((episode) => (
            <PipelineEpisode
              episode={episode}
              isRestarting={props.restartingEpisodeId === episode.episodeId}
              key={episode.episodeId}
              onRestartVideo={props.onRestartVideo}
            />
          ))
        )}
      </section>

      {recentlyCompleted.length > 0 ? (
        <details className="open-panel pipeline-completed">
          <summary>Recently completed ({recentlyCompleted.length})</summary>
          <div className="pipeline-list pipeline-completed-list">
            {recentlyCompleted.map((episode) => (
              <PipelineEpisode
                episode={episode}
                isRestarting={false}
                key={episode.episodeId}
                onRestartVideo={props.onRestartVideo}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PipelineEpisode(props: {
  episode: PodcastPipelineEpisode;
  isRestarting: boolean;
  onRestartVideo: (episodeId: string) => void;
}) {
  const { episode } = props;
  const ingestError = episode.ingest?.lastError;
  const visualError = episode.visual?.lastError;

  return (
    <article className="open-panel pipeline-episode">
      <header className="pipeline-episode-head">
        <div>
          <span className="pipeline-phase-label">
            {phaseLabel(episode.currentPhase)}
          </span>
          <h3>{episode.title ?? shortId(episode.episodeId)}</h3>
          <small>
            Added {relativeTime(episode.createdAt)} ·{' '}
            {shortId(episode.episodeId)}
            {episode.ingest ? ` · ingest ${statusLabel(episode.ingest.status)}` : ''}
          </small>
        </div>
        {episode.currentPhase !== 'done' ? (
          <button
            className="refresh-button pipeline-retry"
            disabled={!episode.canRestartVideo || props.isRestarting}
            onClick={() => props.onRestartVideo(episode.episodeId)}
            title={
              episode.canRestartVideo
                ? 'Restart only unfinished visual/video checkpoints'
                : 'Video retry requires completed audio and no active render lease'
            }
            type="button"
          >
            <RotateCcw aria-hidden="true" />
            {props.isRestarting ? 'Restarting…' : 'Restart video'}
          </button>
        ) : null}
      </header>

      <div className="pipeline-phase-grid">
        <PhaseCell label="Translation" status={episode.translationStatus} />
        <PhaseCell label="TTS" status={episode.ttsStatus} />
        <PhaseCell
          detail={jobDetail(episode.visual)}
          label="Visual"
          status={episode.visual?.status ?? 'pending'}
        />
        <PhaseCell label="Video" status={episode.videoStatus} />
      </div>

      {ingestError && episode.ingest?.status !== 'completed' ? (
        <PipelineError label="Ingest failure" message={ingestError} />
      ) : null}
      {visualError ? (
        <PipelineError label="Visual failure" message={visualError} />
      ) : null}

      <details className="pipeline-details">
        <summary>Language and render details</summary>
        <div className="pipeline-language-grid">
          {episode.localizations.map((localization) => {
            const render = episode.renders.find(
              ({ languageCode }) => languageCode === localization.languageCode,
            );
            return (
              <div
                className="pipeline-language"
                key={localization.languageCode}
              >
                <strong>{languageLabel(localization.languageCode)}</strong>
                <span>
                  Script {localization.hasScript ? '✓' : '—'} · Audio{' '}
                  {localization.hasAudio ? '✓' : '—'}
                </span>
                <span>
                  Render <StatusLabel status={render?.status ?? 'pending'} />
                </span>
                {render?.stage ? (
                  <small>
                    {render.stage}
                    {render.progressPercent !== null
                      ? ` · ${render.progressPercent}%`
                      : ''}
                  </small>
                ) : null}
                {render?.lastError ? (
                  <small className="warning-text">
                    {compactError(render.lastError)}
                  </small>
                ) : null}
              </div>
            );
          })}
        </div>
      </details>
    </article>
  );
}

function PhaseCell(props: {
  label: string;
  status: PodcastPipelineStatus;
  detail?: string | null;
}) {
  return (
    <div className="pipeline-phase-cell">
      <span>{props.label}</span>
      <StatusLabel status={props.status} />
      {props.detail ? <small>{props.detail}</small> : null}
    </div>
  );
}

function StatusLabel(props: { status: PodcastPipelineStatus }) {
  return (
    <strong className={`pipeline-status pipeline-status-${props.status}`}>
      {statusLabel(props.status)}
    </strong>
  );
}

function Summary(props: { label: string; value: number; tone?: 'failed' }) {
  return (
    <div className="pipeline-summary-item">
      <span>{props.label}</span>
      <strong className={props.tone === 'failed' ? 'warning-text' : undefined}>
        {props.value}
      </strong>
    </div>
  );
}

function PipelineError(props: { label: string; message: string }) {
  return (
    <div className="pipeline-error" role="status">
      <strong>{props.label}</strong>
      <span>{compactError(props.message)}</span>
    </div>
  );
}

function jobDetail(job: PodcastPipelineJobState | null): string | null {
  if (!job) {
    return null;
  }
  const parts = [
    job.stage,
    job.progressPercent !== null ? `${job.progressPercent}%` : null,
    job.attempts > 0 ? `${job.attempts}/3 attempts` : null,
    job.updatedAt ? relativeTime(job.updatedAt) : null,
  ].filter((value): value is string => Boolean(value));
  return parts.join(' · ') || null;
}

function statusLabel(status: PodcastPipelineStatus): string {
  switch (status) {
    case 'completed':
      return 'Done';
    case 'processing':
      return 'Processing';
    case 'stuck':
      return 'Stuck';
    case 'queued':
      return 'Queued';
    case 'failed':
      return 'Failed';
    default:
      return 'Pending';
  }
}

function phaseLabel(phase: PodcastPipelineEpisode['currentPhase']): string {
  switch (phase) {
    case 'translation':
      return 'Translation';
    case 'tts':
      return 'TTS';
    case 'video':
      return 'Video';
    default:
      return 'Complete';
  }
}

function hasFailure(episode: PodcastPipelineEpisode): boolean {
  return (
    episode.translationStatus === 'failed' ||
    episode.ttsStatus === 'failed' ||
    episode.videoStatus === 'failed'
  );
}

function hasStuckWork(episode: PodcastPipelineEpisode): boolean {
  return (
    episode.translationStatus === 'stuck' ||
    episode.ttsStatus === 'stuck' ||
    episode.videoStatus === 'stuck'
  );
}

function languageLabel(languageCode: 'zh-Hant' | 'ja' | 'en'): string {
  if (languageCode === 'zh-Hant') {
    return '🇹🇼 zh-Hant';
  }
  return languageCode === 'ja' ? '🇯🇵 ja' : '🇺🇸 en';
}

function compactError(error: string): string {
  const compact = error.replace(/\s+/gu, ' ').trim();
  if (compact.length > 280) {
    return `${compact.slice(0, 277)}…`;
  }
  return compact;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}
