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
  const failed = active.filter(({ videoStatus }) => videoStatus === 'failed');

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
          <Summary label="Video failed" value={failed.length} tone="failed" />
          <Summary
            label="Processing"
            value={
              active.filter(
                (episode) =>
                  episode.translationStatus === 'processing' ||
                  episode.ttsStatus === 'processing' ||
                  episode.videoStatus === 'processing',
              ).length
            }
          />
        </div>
      </section>

      <section className="pipeline-list" aria-label="Podcast production status">
        {props.data.episodes.map((episode) => (
          <PipelineEpisode
            episode={episode}
            isRestarting={props.restartingEpisodeId === episode.episodeId}
            key={episode.episodeId}
            onRestartVideo={props.onRestartVideo}
          />
        ))}
      </section>
    </div>
  );
}

function PipelineEpisode(props: {
  episode: PodcastPipelineEpisode;
  isRestarting: boolean;
  onRestartVideo: (episodeId: string) => void;
}) {
  const { episode } = props;
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
            Added {relativeTime(episode.createdAt)} · {shortId(episode.episodeId)}
          </small>
        </div>
        <button
          className="refresh-button pipeline-retry"
          disabled={!episode.canRestartVideo || props.isRestarting}
          onClick={() => props.onRestartVideo(episode.episodeId)}
          title={
            episode.canRestartVideo
              ? 'Reset only visual planning and video rendering'
              : 'Video retry requires completed audio and no active render lease'
          }
          type="button"
        >
          <RotateCcw aria-hidden="true" />
          {props.isRestarting ? 'Restarting…' : 'Restart video'}
        </button>
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

      {visualError ? (
        <div className="pipeline-error" role="status">
          <strong>Visual failure</strong>
          <span>{compactError(visualError)}</span>
        </div>
      ) : null}

      <details className="pipeline-details">
        <summary>Language and render details</summary>
        <div className="pipeline-language-grid">
          {episode.localizations.map((localization) => {
            const render = episode.renders.find(
              ({ languageCode }) => languageCode === localization.languageCode,
            );
            return (
              <div className="pipeline-language" key={localization.languageCode}>
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

function Summary(props: {
  label: string;
  value: number;
  tone?: 'failed';
}) {
  return (
    <div className="pipeline-summary-item">
      <span>{props.label}</span>
      <strong className={props.tone === 'failed' ? 'warning-text' : undefined}>
        {props.value}
      </strong>
    </div>
  );
}

function jobDetail(job: PodcastPipelineJobState | null): string | null {
  if (!job) return null;
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

function languageLabel(languageCode: 'zh-Hant' | 'ja' | 'en'): string {
  return languageCode === 'zh-Hant'
    ? '🇹🇼 zh-Hant'
    : languageCode === 'ja'
      ? '🇯🇵 ja'
      : '🇺🇸 en';
}

function compactError(error: string): string {
  const compact = error.replace(/\s+/gu, ' ').trim();
  return compact.length > 280 ? `${compact.slice(0, 277)}…` : compact;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}
