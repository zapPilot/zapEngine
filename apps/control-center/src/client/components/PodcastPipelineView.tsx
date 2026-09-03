import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import type {
  PodcastPipelineEpisode,
  PodcastPipelineJobState,
  PodcastPipelineResponse,
  PodcastPipelineRestartAction,
  PodcastPipelineStatus,
  PodcastPipelineVisualDebug,
} from '../../shared/podcast-pipeline.js';
import type {
  PodcastVideoReviewInput,
  PodcastVideoReviewResolveInput,
  PodcastVisualDebugResponse,
} from '../../shared/podcast-visual.js';
import type { StatementsResponse } from '../../shared/statements.js';
import { relativeTime } from '../format.js';
import { PodcastVisualDebugPanel } from './PodcastVisualDebugPanel.js';
import { StatementHeader } from './StatementHeader.js';

export function PodcastPipelineView(props: {
  data: PodcastPipelineResponse | null;
  restartingEpisodeId: string | null;
  onRestartStep: (
    episodeId: string,
    action: PodcastPipelineRestartAction,
  ) => void;
  onLoadVisualDebug: (episodeId: string) => Promise<PodcastVisualDebugResponse>;
  onSubmitReview: (
    episodeId: string,
    review: PodcastVideoReviewInput,
  ) => Promise<void>;
  onResolveReview: (
    episodeId: string,
    reviewId: string,
    input: PodcastVideoReviewResolveInput,
  ) => Promise<void>;
  visualDebugByEpisode: Record<string, PodcastVisualDebugResponse | undefined>;
  statements?: StatementsResponse | null;
}) {
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

function PipelineEpisode(props: {
  episode: PodcastPipelineEpisode;
  isRestarting: boolean;
  onRestartStep: (
    episodeId: string,
    action: PodcastPipelineRestartAction,
  ) => void;
  onLoadVisualDebug: (episodeId: string) => Promise<PodcastVisualDebugResponse>;
  onSubmitReview: (
    episodeId: string,
    review: PodcastVideoReviewInput,
  ) => Promise<void>;
  onResolveReview: (
    episodeId: string,
    reviewId: string,
    input: PodcastVideoReviewResolveInput,
  ) => Promise<void>;
  visualDebug: PodcastVisualDebugResponse | undefined;
}) {
  const { episode } = props;
  const [confirmReplan, setConfirmReplan] = useState(false);
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
          <h3>{episode.title ?? shortId(episode.episodeId)}</h3>
          <small>
            Added {relativeTime(episode.createdAt)} ·{' '}
            {shortId(episode.episodeId)}
            {episode.ingest
              ? ` · ingest ${statusLabel(episode.ingest.status)}`
              : ''}
          </small>
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
                    : 'Restart unfinished renders without discarding a current completed visual'
                  : 'Retry requires completed prerequisites and no live lease'
              }
            />
          ) : null}
          {episode.canForceReplanVisual ? (
            <RestartButton
              disabled={props.isRestarting}
              label={
                confirmReplan
                  ? 'Confirm re-plan (re-renders 3 videos)'
                  : 'Re-plan visuals'
              }
              onClick={() => {
                if (!confirmReplan) {
                  setConfirmReplan(true);
                  return;
                }
                setConfirmReplan(false);
                props.onRestartStep(episode.episodeId, {
                  step: 'video',
                  forceReplan: true,
                });
              }}
              title="Discard the visual checkpoint and generate a new visual plan"
            />
          ) : null}
        </div>
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
      {episode.ingest && episode.ingest.failureHistory.length > 0 ? (
        <details className="pipeline-details">
          <summary>Recent ingest retry history</summary>
          <div className="pipeline-language-grid">
            {episode.ingest.failureHistory.slice(-5).reverse().map((entry) => (
              <div className="pipeline-language" key={`${entry.at}-${entry.kind}`}>
                <strong>{entry.kind.replace('_', ' ')}</strong>
                <span>
                  attempt {entry.attempt} · {relativeTime(entry.at)}
                </span>
                {entry.error ? <small>{compactError(entry.error)}</small> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {visualError ? (
        <PipelineError label="Visual failure" message={visualError} />
      ) : null}
      {episode.visualDebug ? (
        <VisualSearchPlan debug={episode.visualDebug} />
      ) : null}

      <PodcastVisualDebugPanel
        data={props.visualDebug}
        episodeId={episode.episodeId}
        onLoad={props.onLoadVisualDebug}
        onResolveReview={props.onResolveReview}
        onSubmitReview={props.onSubmitReview}
      />

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
                {render?.canRestart ? (
                  <RestartButton
                    disabled={props.isRestarting}
                    label="Retry render"
                    onClick={() =>
                      props.onRestartStep(episode.episodeId, {
                        step: 'render',
                        localizationId: render.localizationId,
                      })
                    }
                    title={`Retry only the ${render.languageCode} render`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </details>
    </article>
  );
}

function VisualSearchPlan(props: { debug: PodcastPipelineVisualDebug }) {
  const { debug } = props;
  const actualKeywords = [
    ...new Set(debug.actualSearches.map(({ query }) => query)),
  ];
  const plannedKeywords = [
    ...new Set(debug.plannedQueries.flatMap(({ queries }) => queries)),
  ];
  const displayedKeywords =
    actualKeywords.length > 0 ? actualKeywords : plannedKeywords;
  const keywordLabel =
    actualKeywords.length > 0
      ? 'Search keywords used'
      : 'Search keywords planned';

  return (
    <details className="pipeline-details">
      <summary>Visual search debug</summary>
      <div className="pipeline-language-grid">
        <div className="pipeline-language">
          <strong>{keywordLabel}</strong>
          <span>
            {displayedKeywords.length > 0
              ? displayedKeywords.join(' · ')
              : 'No search keywords recorded'}
          </span>
          {actualKeywords.length === 0 ? (
            <small>No provider search trace recorded yet</small>
          ) : null}
        </div>
        <div className="pipeline-language">
          <strong>Subjects</strong>
          <span>Primary: {debug.primarySubject ?? '—'}</span>
          <small>
            {debug.subjects.length > 0
              ? debug.subjects.map(({ name }) => name).join(' · ')
              : 'No subject catalog recorded'}
          </small>
        </div>
        {debug.actualSearches.map((search, index) => (
          <div
            className="pipeline-language"
            key={`${search.sceneId}-${search.provider}-${index}`}
          >
            <strong>
              {search.sceneId} · {search.provider}
            </strong>
            <span>{search.query}</span>
            <small>
              returned {search.returned} · accepted {search.accepted} · entity
              filtered {search.entityFiltered} · rejected {search.rejected}
            </small>
          </div>
        ))}
        {debug.plannedQueries.map((scene) => (
          <div className="pipeline-language" key={`planned-${scene.sceneId}`}>
            <strong>{scene.sceneId} · planned</strong>
            <span>
              {scene.selectionReason ?? 'search'}
              {scene.subjectIds.length > 0
                ? ` · ${scene.subjectIds.join(', ')}`
                : ''}
            </span>
            <small>{scene.queries.join(' · ')}</small>
          </div>
        ))}
      </div>
    </details>
  );
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
