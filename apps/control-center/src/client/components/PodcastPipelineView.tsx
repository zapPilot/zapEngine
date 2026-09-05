import { RotateCcw } from 'lucide-react';

import type {
  PodcastPipelineEpisode,
  PodcastPipelineJobState,
  PodcastPipelineResponse,
  PodcastPipelineRestartAction,
  PodcastPipelineStatus,
} from '../../shared/podcast-pipeline.js';
import type {
  PodcastVisualDebugResponse,
  PodcastVisualReviewHandlers,
} from '../../shared/podcast-visual.js';
import type { StatementsResponse } from '../../shared/statements.js';
import { compactError, relativeTime } from '../format.js';
import { CopyableId } from './CopyableId.js';
import { PodcastVisualDebugPanel } from './PodcastVisualDebugPanel.js';
import { StatementHeader } from './StatementHeader.js';

type RestartStepHandler = (
  episodeId: string,
  action: PodcastPipelineRestartAction,
) => void;

/** One language's progress through a phase, as the phase grid draws it. */
interface PhaseLanguageRow {
  languageCode: 'zh-Hant' | 'ja' | 'en';
  status: PodcastPipelineStatus;
  progressPercent: number | null;
  stage: string | null;
  lastError: string | null;
  onRetry?: () => void;
}

export function PodcastPipelineView(
  props: PodcastVisualReviewHandlers & {
    data: PodcastPipelineResponse | null;
    restartingEpisodeId: string | null;
    onRestartStep: RestartStepHandler;
    visualDebugByEpisode: Record<
      string,
      PodcastVisualDebugResponse | undefined
    >;
    statements?: StatementsResponse | null;
  },
) {
  const header = props.statements?.headers.find((h) => h.domain === 'pipeline');

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
  const recentlyCompleted = props.data.episodes.filter(
    ({ currentPhase }) => currentPhase === 'done',
  );
  const failed = active.filter((episode) => hasFailure(episode));
  const stuck = active.filter((episode) => hasStuckWork(episode));

  return (
    <div className="pipeline-view">
      {header ? (
        <StatementHeader
          facts={header.facts}
          sentence={header.sentence}
          status={header.status}
        />
      ) : null}

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
              onLoadVisualDebug={props.onLoadVisualDebug}
              onResolveReview={props.onResolveReview}
              onRestartStep={props.onRestartStep}
              onSubmitReview={props.onSubmitReview}
              visualDebug={props.visualDebugByEpisode[episode.episodeId]}
            />
          ))
        )}
      </section>

      {recentlyCompleted.length > 0 ? (
        <details className="open-panel pipeline-completed">
          <summary>Completed ({recentlyCompleted.length})</summary>
          <div className="pipeline-list pipeline-completed-list">
            {recentlyCompleted.map((episode) => (
              <PipelineEpisode
                episode={episode}
                isRestarting={false}
                key={episode.episodeId}
                onLoadVisualDebug={props.onLoadVisualDebug}
                onResolveReview={props.onResolveReview}
                onRestartStep={props.onRestartStep}
                onSubmitReview={props.onSubmitReview}
                visualDebug={props.visualDebugByEpisode[episode.episodeId]}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PipelineEpisode(
  props: PodcastVisualReviewHandlers & {
    episode: PodcastPipelineEpisode;
    isRestarting: boolean;
    onRestartStep: RestartStepHandler;
    visualDebug: PodcastVisualDebugResponse | undefined;
  },
) {
  const { episode } = props;
  const ingestError = episode.ingest?.lastError;
  const visualError =
    episode.visual?.status === 'failed' ? episode.visual.lastError : null;
  const isIngestPhase =
    episode.currentPhase === 'translation' || episode.currentPhase === 'tts';
  const canRestart = isIngestPhase
    ? episode.canRestartIngest
    : episode.canRestartVideo;
  const restartLabel = isIngestPhase ? 'Restart ingest' : 'Restart video';

  return (
    <article className="open-panel pipeline-episode">
      <header className="pipeline-episode-head">
        <div>
          <span className="pipeline-phase-label">
            {phaseLabel(episode.currentPhase)}
          </span>
          <h3>{episode.title ?? episode.episodeId}</h3>
          {/* The full UUID, because every retry command, Supabase query and
              Fly log filter an operator writes next needs the whole value. */}
          <div className="pipeline-episode-meta">
            <CopyableId
              className="pipeline-episode-id"
              label="episode id"
              value={episode.episodeId}
            />
            <small>Added {relativeTime(episode.createdAt)}</small>
            {episode.ingest ? (
              <small>ingest {statusLabel(episode.ingest.status)}</small>
            ) : null}
          </div>
        </div>
        <div className="pipeline-retry-actions">
          {episode.currentPhase !== 'done' ? (
            <RestartButton
              disabled={!canRestart || props.isRestarting}
              label={props.isRestarting ? 'Restarting…' : restartLabel}
              onClick={() =>
                props.onRestartStep(
                  episode.episodeId,
                  isIngestPhase
                    ? { step: 'ingest' }
                    : { step: 'video', forceReplan: false },
                )
              }
              title={
                canRestart
                  ? isIngestPhase
                    ? 'Resume translation/TTS from durable checkpoints'
                    : 'Resume visual planning or unfinished renders from durable checkpoints'
                  : 'Retry requires completed prerequisites and no live lease'
              }
            />
          ) : null}
        </div>
      </header>

      {/* Per-language progress lives in the phase it belongs to. The images are
          shared by all three renders, so a language only ever differs in its
          script, its audio and its encode — and those are exactly the three
          cells that now carry the language rows. */}
      <div className="pipeline-phase-grid">
        <PhaseCell
          label="Translation"
          languages={scriptLanguages(episode)}
          status={episode.translationStatus}
        />
        <PhaseCell
          label="TTS"
          languages={audioLanguages(episode)}
          status={episode.ttsStatus}
        />
        <PhaseCell
          detail={jobDetail(episode.visual)}
          label="Visual"
          progressPercent={episode.visual?.progressPercent ?? null}
          status={episode.visual?.status ?? 'pending'}
        />
        <PhaseCell
          label="Video"
          languages={renderLanguages(props)}
          status={episode.videoStatus}
        />
      </div>

      {ingestError && episode.ingest?.status !== 'completed' ? (
        <PipelineError label="Ingest failure" message={ingestError} />
      ) : null}
      {episode.ingest && episode.ingest.failureHistory.length > 0 ? (
        <details className="pipeline-details">
          <summary>Recent ingest retry history</summary>
          <div className="pipeline-language-grid">
            {episode.ingest.failureHistory
              .slice(-5)
              .reverse()
              .map((entry) => (
                <div
                  className="pipeline-language"
                  key={`${entry.at}-${entry.kind}`}
                >
                  <strong>{entry.kind.replace('_', ' ')}</strong>
                  <span>
                    attempt {entry.attempt} · {relativeTime(entry.at)}
                  </span>
                  {entry.error ? (
                    <small>{compactError(entry.error)}</small>
                  ) : null}
                </div>
              ))}
          </div>
        </details>
      ) : null}
      {visualError ? (
        <PipelineError label="Visual failure" message={visualError} />
      ) : null}

      <PodcastVisualDebugPanel
        data={props.visualDebug}
        episodeId={episode.episodeId}
        onLoadVisualDebug={props.onLoadVisualDebug}
        onResolveReview={props.onResolveReview}
        onSubmitReview={props.onSubmitReview}
        pipelineDebug={episode.visualDebug}
      />
    </article>
  );
}

function scriptLanguages(episode: PodcastPipelineEpisode): PhaseLanguageRow[] {
  return episode.localizations.map((localization) => ({
    languageCode: localization.languageCode,
    status: localization.hasScript ? 'completed' : 'pending',
    progressPercent: localization.hasScript ? 100 : null,
    stage: null,
    lastError: null,
  }));
}

function audioLanguages(episode: PodcastPipelineEpisode): PhaseLanguageRow[] {
  return episode.localizations.map((localization) => ({
    languageCode: localization.languageCode,
    status: localization.hasAudio ? 'completed' : 'pending',
    progressPercent: localization.hasAudio ? 100 : null,
    stage: null,
    lastError: null,
  }));
}

function renderLanguages(props: {
  episode: PodcastPipelineEpisode;
  isRestarting: boolean;
  onRestartStep: RestartStepHandler;
}): PhaseLanguageRow[] {
  return props.episode.renders.map((render) => ({
    languageCode: render.languageCode,
    status: render.status,
    progressPercent: render.progressPercent,
    stage: render.stage,
    lastError: render.lastError,
    ...(render.canRestart && !props.isRestarting
      ? {
          onRetry: () =>
            props.onRestartStep(props.episode.episodeId, {
              step: 'render',
              localizationId: render.localizationId,
            }),
        }
      : {}),
  }));
}

function RestartButton(props: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      className="refresh-button pipeline-retry"
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
      type="button"
    >
      <RotateCcw aria-hidden="true" />
      {props.label}
    </button>
  );
}

function PhaseCell(props: {
  label: string;
  status: PodcastPipelineStatus;
  detail?: string | null;
  progressPercent?: number | null;
  languages?: PhaseLanguageRow[];
}) {
  return (
    <div className="pipeline-phase-cell">
      <span>{props.label}</span>
      <StatusLabel status={props.status} />
      {props.detail ? <small>{props.detail}</small> : null}
      {props.progressPercent !== null && props.progressPercent !== undefined ? (
        <ProgressBar percent={props.progressPercent} status={props.status} />
      ) : null}
      {props.languages?.map((language) => (
        <div className="pipeline-phase-lang" key={language.languageCode}>
          <span>{languageLabel(language.languageCode)}</span>
          <ProgressBar
            percent={language.progressPercent}
            status={language.status}
          />
          <StatusLabel status={language.status} />
          {language.stage ? <small>{language.stage}</small> : null}
          {language.lastError ? (
            <small className="warning-text">
              {compactError(language.lastError)}
            </small>
          ) : null}
          {language.onRetry ? (
            <button
              className="refresh-button pipeline-retry"
              onClick={language.onRetry}
              title={`Retry only the ${language.languageCode} render`}
              type="button"
            >
              <RotateCcw aria-hidden="true" />
              Retry render
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ProgressBar(props: {
  percent: number | null;
  status: PodcastPipelineStatus;
}) {
  // A finished job stops reporting progress, so an absent percentage on a
  // completed row is a full bar rather than an empty one.
  const percent = props.percent ?? (props.status === 'completed' ? 100 : 0);
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div className={`pipeline-progress pipeline-progress-${props.status}`}>
      <span style={{ width: `${width}%` }} />
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
    case 'unscheduled':
      return 'Not scheduled';
    case 'stale':
      return 'Stale version';
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
    episode.videoStatus === 'stuck' ||
    episode.videoStatus === 'stale'
  );
}

function languageLabel(languageCode: 'zh-Hant' | 'ja' | 'en'): string {
  if (languageCode === 'zh-Hant') {
    return '🇹🇼 zh-Hant';
  }
  return languageCode === 'ja' ? '🇯🇵 ja' : '🇺🇸 en';
}
