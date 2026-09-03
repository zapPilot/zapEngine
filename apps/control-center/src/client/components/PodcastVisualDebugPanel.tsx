import { PODCAST_VIDEO_REVIEW_ISSUES } from '@zapengine/types/shared';
import { useMemo, useState } from 'react';

import type {
  PodcastVideoReviewInput,
  PodcastVideoReviewIssue,
  PodcastVideoReviewVerdict,
  PodcastVisualDebugResponse,
  PodcastVisualReviewHandlers,
  PodcastVisualSceneDebug,
} from '../../shared/podcast-visual.js';

export function PodcastVisualDebugPanel(
  props: PodcastVisualReviewHandlers & {
    episodeId: string;
    data: PodcastVisualDebugResponse | undefined;
  },
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [slidesOnly, setSlidesOnly] = useState(false);

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

  return (
    <details
      className="pipeline-details podcast-visual-debug"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          void load();
        }
      }}
    >
      <summary>Visual plan, search trace and review</summary>
      {loading ? (
        <div className="empty-row">Loading visual evidence…</div>
      ) : null}
      {error ? <div className="pipeline-error">{error}</div> : null}
      {props.data?.status !== 'ok' && props.data ? (
        <div className="empty-row">
          {props.data.message ?? 'Visual debug unavailable'}
        </div>
      ) : null}
      {props.data?.status === 'ok' ? (
        <div className="podcast-visual-debug-body">
          <VisualFacts data={props.data} />
          {props.data.failure ? (
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
          <ReviewEditor
            key={`episode-${props.data.visual?.visualHash ?? 'none'}`}
            onSubmit={(review) => props.onSubmitReview(props.episodeId, review)}
            pipelineContext={{
              visualVersion: props.data.visual?.visualVersion,
              visualHash: props.data.visual?.visualHash,
            }}
            visualHash={props.data.visual?.visualHash ?? null}
          />
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
                onSubmitReview={props.onSubmitReview}
                scene={scene}
                visualHash={props.data?.visual?.visualHash ?? null}
              />
            ))}
          </div>
          {props.data.reviews.length > 0 ? (
            <section className="podcast-review-list">
              <h4>Reviews</h4>
              {props.data.reviews.map((review) => (
                <div className="pipeline-language" key={review.id}>
                  <strong>
                    {review.sceneId ?? 'episode'} · {review.verdict} ·{' '}
                    {review.status}
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
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

function VisualFacts(props: { data: PodcastVisualDebugResponse }) {
  const { visual } = props.data;
  return (
    <div className="pipeline-language-grid">
      <Fact
        label="Visual"
        value={
          visual
            ? `${visual.status} · ${visual.visualVersion ?? 'no version'}`
            : 'not scheduled'
        }
      />
      <Fact label="Hash" value={visual?.visualHash ?? '—'} />
      <Fact label="Attempts" value={String(visual?.attempts ?? 0)} />
      {props.data.renders.map((render) => (
        <div className="pipeline-language" key={render.languageCode}>
          <strong>{render.languageCode} render</strong>
          <span>{render.status}</span>
          {render.thumbnailUrl ? (
            <img
              alt={`${render.languageCode} thumbnail`}
              loading="lazy"
              src={render.thumbnailUrl}
            />
          ) : null}
          {render.mp4Url ? (
            <a href={render.mp4Url} rel="noreferrer" target="_blank">
              Open mp4
            </a>
          ) : null}
        </div>
      ))}
    </div>
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

function SceneDebug(props: {
  episodeId: string;
  scene: PodcastVisualSceneDebug;
  visualHash: string | null;
  onSubmitReview: (
    episodeId: string,
    review: PodcastVideoReviewInput,
  ) => Promise<void>;
}) {
  const { scene } = props;
  return (
    <article className="podcast-visual-scene">
      <div className="podcast-visual-thumb">
        {scene.asset?.url ? (
          <img alt="" loading="lazy" src={scene.asset.url} />
        ) : (
          <span>No asset</span>
        )}
      </div>
      <div>
        <strong>{scene.sceneId}</strong>
        <p>
          {scene.sentenceText ??
            'Sentence text not persisted for this version.'}
        </p>
        <small>
          {scene.imageSearchIntent.join(' · ') || 'No image search intent'}
        </small>
        {scene.imageSearchEntities.length > 0 ? (
          <div className="podcast-visual-chips">
            {scene.imageSearchEntities.map((entity) => (
              <strong key={entity}>{entity}</strong>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <strong>
          {scene.asset?.provider ?? 'none'}
          {scene.asset?.provider === 'generated-slide'
            ? ' · generated-slide'
            : ''}
        </strong>
        <small>
          {scene.asset?.license ?? 'no license'} ·{' '}
          {scene.selectionReason ?? 'no assignment'}
        </small>
        {scene.asset?.slideHeadline ? <p>{scene.asset.slideHeadline}</p> : null}
        {scene.trace.map((trace, index) => (
          <small key={`${trace.provider}-${index}`}>
            {trace.provider} {trace.returned}→{trace.accepted} · filtered{' '}
            {trace.entityFiltered} · rejected {trace.rejected}
            <br />
            {trace.query}
          </small>
        ))}
      </div>
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
        }}
        sceneId={scene.sceneId}
        visualHash={props.visualHash}
      />
    </article>
  );
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
