import { PODCAST_VIDEO_REVIEW_ISSUES } from '@zapengine/types/shared';
import { useMemo, useState } from 'react';

import type {
  PodcastPipelineVisualBudget,
  PodcastPipelineVisualDebug,
  PodcastPipelineVisualSearchAttempt,
  PodcastPipelineVisualSubjectSearch,
} from '../../shared/podcast-pipeline.js';
import type {
  PodcastVideoReview,
  PodcastVideoReviewInput,
  PodcastVideoReviewIssue,
  PodcastVideoReviewVerdict,
  PodcastVisualDebugResponse,
  PodcastVisualReviewHandlers,
  PodcastVisualSceneDebug,
} from '../../shared/podcast-visual.js';
import { compactError } from '../format.js';
import { CopyableId } from './CopyableId.js';

/**
 * The whole image-selection story for one episode, in the order the question is
 * asked: what was searched, what came back, and which result each scene's
 * caption ended up next to. It used to be three sections on the card — a
 * keyword summary, a request list, and the scene review — so answering "why is
 * there a photo of a charging cable on the Tether scene?" meant reading counts
 * in one panel and captions in another and joining them by hand.
 */
export function PodcastVisualDebugPanel(
  props: PodcastVisualReviewHandlers & {
    episodeId: string;
    data: PodcastVisualDebugResponse | undefined;
    pipelineDebug: PodcastPipelineVisualDebug | null | undefined;
  },
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [slidesOnly, setSlidesOnly] = useState(false);
  const { pipelineDebug } = props;

  const scenes = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (props.data?.scenes ?? []).filter((scene) => {
      if (slidesOnly && scene.asset?.provider !== 'generated-slide') {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        scene.sceneId,
        scene.sentenceText,
        ...scene.imageSearchIntent,
        ...scene.imageSearchEntities,
        scene.asset?.provider,
        scene.asset?.slideHeadline,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [filter, props.data?.scenes, slidesOnly]);

  const reviewsByScene = useMemo(
    () => groupReviewsByScene(props.data?.reviews ?? []),
    [props.data?.reviews],
  );

  async function load(): Promise<void> {
    if (props.data || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await props.onLoadVisualDebug(props.episodeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Visual debug failed');
    } finally {
      setLoading(false);
    }
  }

  const visualHash = props.data?.visual?.visualHash ?? null;

  return (
    <details
      className="pipeline-details podcast-visual-debug"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          void load();
        }
      }}
    >
      <summary>{summaryLine(props.data, pipelineDebug)}</summary>
      {loading ? (
        <div className="empty-row">Loading visual evidence…</div>
      ) : null}
      {error ? <div className="pipeline-error">{error}</div> : null}
      {props.data?.status !== 'ok' && props.data ? (
        <div className="empty-row">
          {props.data.message ?? 'Visual debug unavailable'}
        </div>
      ) : null}
      <div className="podcast-visual-debug-body">
        <VisualDebugHeader
          debug={pipelineDebug ?? null}
          episodeId={props.episodeId}
          episodeReviews={reviewsByScene.get(null) ?? []}
          onResolveReview={props.onResolveReview}
          onSubmitReview={props.onSubmitReview}
          visual={props.data?.visual ?? null}
          visualHash={visualHash}
        />
        {props.data?.failure ? (
          <section className="pipeline-error">
            <strong>
              Failure · {props.data.failure.stage ?? 'unknown stage'}
            </strong>
            <span>{props.data.failure.message ?? 'No message recorded'}</span>
            <details>
              <summary>Raw diagnostics</summary>
              <pre>{JSON.stringify(props.data.failure.raw, null, 2)}</pre>
            </details>
          </section>
        ) : null}
        <SearchList searches={pipelineDebug?.actualSearches ?? []} />
        {(pipelineDebug?.actualSearches.length ?? 0) === 0 ? (
          <PlannedSearches debug={pipelineDebug ?? null} />
        ) : null}
        {props.data?.status === 'ok' ? (
          <>
            <div className="podcast-visual-toolbar">
              <input
                aria-label="Filter visual scenes"
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter scenes / queries / entities"
                value={filter}
              />
              <label>
                <input
                  checked={slidesOnly}
                  onChange={(event) => setSlidesOnly(event.target.checked)}
                  type="checkbox"
                />{' '}
                slides only
              </label>
            </div>
            <div className="podcast-visual-scenes">
              {scenes.map((scene) => (
                <SceneDebug
                  episodeId={props.episodeId}
                  key={scene.sceneId}
                  onResolveReview={props.onResolveReview}
                  onSubmitReview={props.onSubmitReview}
                  reviews={reviewsByScene.get(scene.sceneId) ?? []}
                  scene={scene}
                  visualHash={visualHash}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </details>
  );
}

/** What the section is worth opening for, before it is opened: how many scenes
 * are explained inside and how much of the Brave budget the episode spent. */
function summaryLine(
  data: PodcastVisualDebugResponse | undefined,
  debug: PodcastPipelineVisualDebug | null | undefined,
): string {
  const sceneCount = data?.scenes.length ?? debug?.sceneSelections.length ?? 0;
  const parts = ['Visual debug'];
  if (sceneCount > 0) {
    parts.push(`${sceneCount} scenes`);
  }
  if (debug?.budget) {
    parts.push(`requests ${debug.budget.requestCount}/${debug.budget.max}`);
  }
  return parts.join(' · ');
}

function VisualDebugHeader(
  props: Pick<
    PodcastVisualReviewHandlers,
    'onResolveReview' | 'onSubmitReview'
  > & {
    debug: PodcastPipelineVisualDebug | null;
    episodeId: string;
    episodeReviews: PodcastVideoReview[];
    visual: PodcastVisualDebugResponse['visual'];
    visualHash: string | null;
  },
) {
  const { debug, visual } = props;
  return (
    <section className="podcast-visual-header">
      <div className="podcast-visual-facts">
        <Fact
          label="Visual"
          value={
            visual
              ? `${visual.status} · ${visual.visualVersion ?? 'no version'}`
              : (debug?.phase ?? 'not scheduled')
          }
        />
        <Fact label="Attempts" value={String(visual?.attempts ?? 0)} />
        <div className="pipeline-language">
          <strong>Hash</strong>
          {props.visualHash ? (
            <CopyableId label="visual hash" value={props.visualHash} />
          ) : (
            <span>—</span>
          )}
        </div>
        <div className="pipeline-language">
          <strong>Primary subject</strong>
          <span>{debug?.primarySubject ?? '—'}</span>
          <small>
            {debug && debug.subjects.length > 0
              ? debug.subjects.map(({ name }) => name).join(' · ')
              : 'No subject catalog recorded'}
          </small>
          {debug?.subjectCatalogFailure ? (
            <small className="warning-text">
              catalog degraded: {compactError(debug.subjectCatalogFailure)}
            </small>
          ) : null}
        </div>
        {debug?.budget ? (
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
        {debug && debug.reuse.length > 0 ? (
          <div className="pipeline-language">
            <strong>Image reuse</strong>
            {debug.reuse.map(({ assetId, useCount }) => (
              <small key={assetId}>
                {assetId} · {useCount} scenes
              </small>
            ))}
          </div>
        ) : null}
      </div>
      <details className="pipeline-details">
        <summary>Episode review</summary>
        <ReviewEditor
          key={`episode-${props.visualHash ?? 'none'}`}
          onSubmit={(review) => props.onSubmitReview(props.episodeId, review)}
          pipelineContext={{
            visualVersion: visual?.visualVersion,
            visualHash: props.visualHash,
          }}
          visualHash={props.visualHash}
        />
      </details>
      <ReviewList
        episodeId={props.episodeId}
        onResolveReview={props.onResolveReview}
        reviews={props.episodeReviews}
      />
    </section>
  );
}

function Fact(props: { label: string; value: string }) {
  return (
    <div className="pipeline-language">
      <strong>{props.label}</strong>
      <span>{props.value}</span>
    </div>
  );
}

/** Every Brave request the attempt paid for, each with the head of what came
 * back. The counts and the pictures have to sit together: a request that
 * returned 100 and kept 13 reads as a healthy search until the 13 are visible. */
function SearchList(props: { searches: PodcastPipelineVisualSearchAttempt[] }) {
  if (props.searches.length === 0) {
    return null;
  }
  return (
    <section className="podcast-visual-searches">
      <h4>Searches</h4>
      {props.searches.map((search, index) => (
        <article
          className="podcast-visual-search"
          key={`request-${search.sceneId ?? search.subjectLabel ?? ''}-${index}`}
        >
          <header>
            <strong>{requestTitle(search)}</strong>
            <p className="podcast-visual-query">{search.query}</p>
            <small>
              returned {search.returned} · viable {search.viable}
              {search.drops.length > 0 ? ` · drops ${dropLine(search)}` : ''}
            </small>
            {search.error ? (
              <small className="warning-text">
                {compactError(search.error)}
              </small>
            ) : null}
          </header>
          <CandidateStrip candidates={search.candidates} />
        </article>
      ))}
    </section>
  );
}

function CandidateStrip(props: {
  candidates: PodcastPipelineVisualSearchAttempt['candidates'];
}) {
  if (props.candidates.length === 0) {
    return (
      <small className="podcast-visual-candidates-empty">
        Candidates not recorded for this attempt — re-plan to capture
      </small>
    );
  }
  return (
    <div className="podcast-visual-candidates">
      {props.candidates.map((candidate) => (
        <figure
          className={candidateClassName(
            candidate.dropReason !== null,
            Boolean(candidate.selectedBySceneId),
          )}
          key={`${candidate.providerRank}-${candidate.imageUrl}`}
        >
          <a href={candidate.sourceUrl} rel="noreferrer" target="_blank">
            <img
              alt={candidate.altText ?? ''}
              loading="lazy"
              src={candidate.imageUrl}
              title={candidate.altText ?? candidate.imageUrl}
            />
          </a>
          <figcaption>
            #{candidate.providerRank} · {candidateHost(candidate.sourceUrl)}
          </figcaption>
          {candidate.dropReason ? (
            <small className="podcast-visual-candidate-drop">
              {candidate.dropReason}
            </small>
          ) : null}
          {candidate.selectedBySceneId ? (
            <small className="podcast-visual-candidate-selected">
              {candidate.selectedBySceneId}
            </small>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

function candidateClassName(dropped: boolean, selected: boolean): string {
  return [
    'podcast-visual-candidate',
    dropped ? 'dropped' : null,
    selected ? 'selected' : null,
  ]
    .filter(Boolean)
    .join(' ');
}

function candidateHost(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return sourceUrl;
  }
}

/** Only shown while the attempt has not sent a request yet. Once real requests
 * exist they are the truth, and repeating the intention next to them is what
 * used to make an operator read a planned query as one that ran. */
function PlannedSearches(props: { debug: PodcastPipelineVisualDebug | null }) {
  const { debug } = props;
  if (!debug) {
    return null;
  }
  const subjectSearches: PodcastPipelineVisualSubjectSearch[] = [
    ...debug.primarySubjects,
    ...debug.plannedSubjectSearches,
  ];
  if (subjectSearches.length === 0 && debug.plannedQueries.length === 0) {
    return null;
  }
  return (
    <section className="podcast-visual-searches">
      <h4>Planned searches</h4>
      <small>No provider search trace recorded yet</small>
      <div className="pipeline-language-grid">
        {subjectSearches.length > 0 ? (
          <div className="pipeline-language">
            <strong>Subject searches</strong>
            {subjectSearches.map(({ label, query }) => (
              <small key={`${label}-${query}`}>
                {label} · “{query}”
              </small>
            ))}
          </div>
        ) : null}
        {debug.plannedQueries.map((scene) => (
          <div className="pipeline-language" key={`planned-${scene.sceneId}`}>
            <strong>{scene.sceneId}</strong>
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
    </section>
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

function groupReviewsByScene(
  reviews: readonly PodcastVideoReview[],
): Map<string | null, PodcastVideoReview[]> {
  const grouped = new Map<string | null, PodcastVideoReview[]>();
  for (const review of reviews) {
    const existing = grouped.get(review.sceneId);
    if (existing) {
      existing.push(review);
    } else {
      grouped.set(review.sceneId, [review]);
    }
  }
  return grouped;
}

function SceneDebug(
  props: Pick<
    PodcastVisualReviewHandlers,
    'onResolveReview' | 'onSubmitReview'
  > & {
    episodeId: string;
    reviews: PodcastVideoReview[];
    scene: PodcastVisualSceneDebug;
    visualHash: string | null;
  },
) {
  const { scene } = props;
  return (
    <article className="podcast-visual-scene">
      <div className="podcast-visual-thumb">
        {scene.asset?.url ? (
          <img alt="" loading="lazy" src={scene.asset.url} />
        ) : (
          <span>No asset</span>
        )}
        <small>
          {scene.asset?.provider ?? 'none'}
          {scene.selection ? ` · ${sceneSelectionLine(scene.selection)}` : ''}
        </small>
        {scene.asset?.slideHeadline ? (
          <small>{scene.asset.slideHeadline}</small>
        ) : null}
      </div>
      <div className="podcast-visual-scene-body">
        <strong>{scene.sceneId}</strong>
        {/* The caption the viewer reads under this image. Without it the panel
            can say which query won and still not say whether the image belongs
            to what the scene is actually talking about. */}
        <p className="podcast-visual-sentence">
          {scene.sentenceText ??
            'Sentence text not persisted for this version.'}
        </p>
        {/* The two lists overlap for a scene whose subject is its own query, so
            each is labelled: one is what Brave was asked, the other is what the
            ranking bonus looks for in a candidate. */}
        <div className="podcast-visual-chips">
          <small>asked</small>
          {scene.imageSearchIntent.length > 0 ? (
            scene.imageSearchIntent.map((intent) => (
              <strong key={intent}>{intent}</strong>
            ))
          ) : (
            <small>no image search intent</small>
          )}
        </div>
        {scene.imageSearchEntities.length > 0 ? (
          <div className="podcast-visual-chips">
            <small>names</small>
            {scene.imageSearchEntities.map((entity) => (
              <strong key={entity}>{entity}</strong>
            ))}
          </div>
        ) : null}
        <small>{scene.selectionReason ?? 'no assignment'}</small>
      </div>
      <div className="podcast-visual-scene-review">
        <ReviewEditor
          onSubmit={(review) => props.onSubmitReview(props.episodeId, review)}
          pipelineContext={{
            visualHash: props.visualHash,
            sceneId: scene.sceneId,
            assetId: scene.asset?.assetId,
            provider: scene.asset?.provider,
            url: scene.asset?.url,
            imageSearchIntent: scene.imageSearchIntent,
            imageSearchEntities: scene.imageSearchEntities,
            subjectIds: scene.subjectIds,
            selectionReason: scene.selectionReason,
            selection: scene.selection,
          }}
          sceneId={scene.sceneId}
          visualHash={props.visualHash}
        />
        <ReviewList
          episodeId={props.episodeId}
          onResolveReview={props.onResolveReview}
          reviews={props.reviews}
        />
      </div>
    </article>
  );
}

function ReviewList(
  props: Pick<PodcastVisualReviewHandlers, 'onResolveReview'> & {
    episodeId: string;
    reviews: PodcastVideoReview[];
  },
) {
  if (props.reviews.length === 0) {
    return null;
  }
  return (
    <section className="podcast-review-list">
      {props.reviews.map((review) => (
        <div className="pipeline-language" key={review.id}>
          <strong>
            {review.verdict} · {review.status}
          </strong>
          <span>
            {review.issueCategories.join(' · ') || 'no issue category'}
          </span>
          {review.note ? <small>{review.note}</small> : null}
          {review.status !== 'resolved' ? (
            <button
              className="refresh-button"
              onClick={() =>
                void props.onResolveReview(props.episodeId, review.id, {
                  status: 'resolved',
                  resolutionNote: 'Verified from Control Center',
                })
              }
              type="button"
            >
              Resolve
            </button>
          ) : null}
        </div>
      ))}
    </section>
  );
}

/** Reads as the decision itself: what the scene got, whose search produced it,
 * and — when the image is a degradation — which rung of the ladder it came off. */
function sceneSelectionLine(
  selection: NonNullable<PodcastVisualSceneDebug['selection']>,
): string {
  const rank =
    selection.providerRank !== null ? ` (#${selection.providerRank})` : '';
  return [
    selection.selection,
    selection.matchedSubject,
    selection.sourceQuery ? `“${selection.sourceQuery}”${rank}` : null,
    selection.fallbackReason ? `fallback: ${selection.fallbackReason}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

function ReviewEditor(props: {
  visualHash: string | null;
  sceneId?: string;
  pipelineContext: Record<string, unknown>;
  onSubmit: (review: PodcastVideoReviewInput) => Promise<void>;
}) {
  const [verdict, setVerdict] = useState<PodcastVideoReviewVerdict>('good');
  const [issues, setIssues] = useState<PodcastVideoReviewIssue[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleIssue(issue: PodcastVideoReviewIssue): void {
    setIssues((current) =>
      current.includes(issue)
        ? current.filter((value) => value !== issue)
        : [...current, issue],
    );
  }

  return (
    <div className="podcast-review-editor">
      <select
        aria-label={
          props.sceneId ? `${props.sceneId} verdict` : 'Episode verdict'
        }
        onChange={(event) =>
          setVerdict(event.target.value as PodcastVideoReviewVerdict)
        }
        value={verdict}
      >
        <option value="good">good</option>
        <option value="acceptable">acceptable</option>
        <option value="bad">bad</option>
      </select>
      <div className="podcast-visual-chips">
        {PODCAST_VIDEO_REVIEW_ISSUES.map((issue) => (
          <label key={issue}>
            <input
              checked={issues.includes(issue)}
              onChange={() => toggleIssue(issue)}
              type="checkbox"
            />{' '}
            {issue}
          </label>
        ))}
      </div>
      <textarea
        aria-label={
          props.sceneId ? `${props.sceneId} review note` : 'Episode review note'
        }
        maxLength={2000}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Operator note"
        value={note}
      />
      <button
        className="refresh-button"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          void props
            .onSubmit({
              visualHash: props.visualHash,
              sceneId: props.sceneId ?? null,
              verdict,
              issueCategories: issues,
              note: note.trim() || null,
              pipelineContext: props.pipelineContext,
            })
            .finally(() => setSaving(false));
        }}
        type="button"
      >
        {saving ? 'Saving…' : 'Save review'}
      </button>
    </div>
  );
}
