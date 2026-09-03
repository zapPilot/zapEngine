import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import type {
  PodcastPipelineEpisode,
  PodcastPipelineJobState,
  PodcastPipelineResponse,
  PodcastPipelineRestartAction,
  PodcastPipelineStatus,
  PodcastPipelineVisualBudget,
  PodcastPipelineVisualDebug,
  PodcastPipelineVisualSceneSelection,
  PodcastPipelineVisualSearchAttempt,
  PodcastPipelineVisualSubjectSearch,
} from '../../shared/podcast-pipeline.js';
import type {
  PodcastVisualDebugResponse,
  PodcastVisualReviewHandlers,
} from '../../shared/podcast-visual.js';
import type { StatementsResponse } from '../../shared/statements.js';
import { relativeTime } from '../format.js';
import { PodcastVisualDebugPanel } from './PodcastVisualDebugPanel.js';
import { StatementHeader } from './StatementHeader.js';

type RestartStepHandler = (
  episodeId: string,
  action: PodcastPipelineRestartAction,
) => void;

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
      {episode.visualDebug ? (
        <VisualSearchPlan debug={episode.visualDebug} />
      ) : null}

      <PodcastVisualDebugPanel
        data={props.visualDebug}
        episodeId={episode.episodeId}
        onLoadVisualDebug={props.onLoadVisualDebug}
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
    ...new Set([
      ...debug.plannedSubjectSearches.map(({ query }) => query),
      ...debug.plannedQueries.flatMap(({ queries }) => queries),
    ]),
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
          {debug.subjectCatalogFailure ? (
            <small className="warning-text">
              catalog degraded: {compactError(debug.subjectCatalogFailure)}
            </small>
          ) : null}
        </div>
        {debug.budget ? (
          <div className="pipeline-language">
            <strong>Request budget</strong>
            <span>{budgetLine(debug.budget, debug.actualSearches)}</span>
            {debug.budget.exhausted ? (
              <small className="warning-text">
                Scenes after the last request fell back to the episode pool
              </small>
            ) : null}
          </div>
        ) : null}
        <SubjectSearchList
          label="Subject searches spent"
          searches={debug.primarySubjects}
        />
        <SubjectSearchList
          label="Subject searches planned"
          searches={debug.plannedSubjectSearches}
        />
        {debug.actualSearches.map((search, index) => (
          <div
            className="pipeline-language"
            key={`request-${search.sceneId ?? search.subjectLabel ?? ''}-${index}`}
          >
            <strong>{requestTitle(search)}</strong>
            <span>{search.query}</span>
            <small>
              returned {search.returned} · viable {search.viable}
              {search.drops.length > 0 ? ` · drops ${dropLine(search)}` : ''}
            </small>
            {search.error ? (
              <small className="warning-text">
                {compactError(search.error)}
              </small>
            ) : null}
          </div>
        ))}
        {debug.sceneSelections.map((scene) => (
          <div className="pipeline-language" key={`selection-${scene.sceneId}`}>
            <strong>
              {scene.sceneId} · {scene.selection}
            </strong>
            <span>{selectionSourceLine(scene)}</span>
            {scene.fallbackReason ? (
              <small className="warning-text">
                fallback: {scene.fallbackReason}
              </small>
            ) : null}
          </div>
        ))}
        {debug.reuse.length > 0 ? (
          <div className="pipeline-language">
            <strong>Image reuse</strong>
            {debug.reuse.map(({ assetId, useCount }) => (
              <small key={assetId}>
                {assetId} · {useCount} scenes
              </small>
            ))}
          </div>
        ) : null}
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

function SubjectSearchList(props: {
  label: string;
  searches: PodcastPipelineVisualSubjectSearch[];
}) {
  if (props.searches.length === 0) {
    return null;
  }
  return (
    <div className="pipeline-language">
      <strong>{props.label}</strong>
      {props.searches.map(({ label, query }) => (
        <small key={`${label}-${query}`}>
          {label} · “{query}”
        </small>
      ))}
    </div>
  );
}

/** The episode's whole image supply is bounded by this line, so a repetitive or
 * off-topic video is read here first: a starved budget and a bad search look
 * identical in the finished video. */
function budgetLine(
  budget: PodcastPipelineVisualBudget,
  searches: PodcastPipelineVisualSearchAttempt[],
): string {
  const spent = (kind: PodcastPipelineVisualSearchAttempt['kind']): number =>
    searches.filter((search) => search.kind === kind).length;
  const parts = [
    `requests ${budget.requestCount}/${budget.max}`,
    `primary ${spent('primary')}/${budget.primary}`,
    `targeted ${spent('targeted')}/${budget.targeted}`,
  ];
  if (budget.exhausted) {
    parts.push('exhausted');
  }
  return parts.join(' · ');
}

function requestTitle(search: PodcastPipelineVisualSearchAttempt): string {
  return [
    search.subjectLabel ?? search.sceneId ?? 'search',
    search.kind ?? search.provider,
  ].join(' · ');
}

function dropLine(search: PodcastPipelineVisualSearchAttempt): string {
  return search.drops
    .map(({ reason, count }) => `${reason} ${count}`)
    .join(', ');
}

function selectionSourceLine(
  scene: PodcastPipelineVisualSceneSelection,
): string {
  const rank = scene.providerRank !== null ? ` (#${scene.providerRank})` : '';
  const parts = [
    scene.matchedSubjectKey,
    scene.sourceQuery ? `from “${scene.sourceQuery}”${rank}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : 'no search result behind it';
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
