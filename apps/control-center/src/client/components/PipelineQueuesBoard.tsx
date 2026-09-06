import { Clapperboard, Images, Languages, Search } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type {
  PipelineQueueItem,
  PipelineQueueLane,
  PipelineQueuesResponse,
  SocialQueueItem,
} from '../../shared/pipeline-queues.js';
import type { PodcastPipelineRestartAction } from '../../shared/podcast-pipeline.js';
import type {
  PodcastVisualDebugResponse,
  PodcastVisualReviewHandlers,
} from '../../shared/podcast-visual.js';
import { getJson } from '../api.js';
import { compactError } from '../format.js';
import './PipelineQueuesBoard.css';
import {
  PLATFORM_LABELS,
  QueueDrawer,
  formatDateTime,
  type SelectedQueueEntry,
} from './QueueDrawer.js';

const POLL_MS = 7_000;

export function PipelineQueuesBoard(
  props: PodcastVisualReviewHandlers & {
    visualDebugByEpisode: Record<
      string,
      PodcastVisualDebugResponse | undefined
    >;
    onRestartStep: (
      episodeId: string,
      action: PodcastPipelineRestartAction,
    ) => Promise<void>;
  },
) {
  const { data, error, reload } = usePipelineQueues();
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = useMemo(
    () => (data && selectedKey ? findSelected(data, selectedKey) : null),
    [data, selectedKey],
  );

  // A retry only looks like it worked once the card has moved lane, so the
  // board refetches immediately instead of waiting out the poll interval.
  const { onRestartStep } = props;
  const restartStep = useCallback(
    async (episodeId: string, action: PodcastPipelineRestartAction) => {
      await onRestartStep(episodeId, action);
      await reload();
    },
    [onRestartStep, reload],
  );

  if (!data) {
    return (
      <section className="queue-board queue-board-loading">
        {error
          ? `Pipeline queues unavailable: ${error}`
          : 'Loading runtime queues…'}
      </section>
    );
  }

  const render = filterLane(data.render, query);

  return (
    <section className="queue-board" aria-label="Runtime pipeline queues">
      <header className="queue-board-head">
        <div>
          <h2>Runtime queues</h2>
          <p>API → Render → Social publishing</p>
        </div>
        <div className="queue-search">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="Search pipeline queues"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Title or episode UUID"
            type="search"
            value={query}
          />
        </div>
      </header>

      <div className="queue-metrics" aria-label="Pipeline queue summary">
        <Metric label="Queue depth" value={data.summary.queueDepth} />
        <Metric label="Processing" value={data.summary.processing} />
        <Metric label="Blocked / failed" value={data.summary.blockedOrFailed} />
        <Metric label="Published today" value={data.summary.publishedToday} />
      </div>
      {data.summary.abandoned > 0 ? (
        <p className="queue-abandoned-note">
          {data.summary.abandoned} abandoned job
          {data.summary.abandoned === 1 ? '' : 's'} hidden from the render
          lanes.
        </p>
      ) : null}

      {error ? (
        <div className="queue-inline-error">Last refresh: {error}</div>
      ) : null}
      {data.status === 'unconfigured' ? (
        <div className="queue-inline-error">{data.message}</div>
      ) : null}

      <div className="queue-columns">
        <QueueColumn
          description="from-fed-to-chain API"
          lane={filterLane(data.api, query)}
          onSelect={setSelectedKey}
          renderItem={(item) => <WorkCard item={item} />}
          title="API queue"
        />
        <QueueColumn
          description="Fly render machines"
          lane={render}
          onSelect={setSelectedKey}
          renderItem={(item) => <WorkCard item={item} />}
          title="Render queue"
        >
          <AbandonedSection
            items={render.abandoned ?? []}
            onSelect={setSelectedKey}
          />
        </QueueColumn>
        <QueueColumn
          description="social:daemon"
          lane={filterLane(data.social, query)}
          onSelect={setSelectedKey}
          renderItem={(item) => <SocialCard item={item} />}
          title="Social publishing"
        />
      </div>

      {selected ? (
        <QueueDrawer
          onClose={() => setSelectedKey(null)}
          onLoadVisualDebug={props.onLoadVisualDebug}
          onResolveReview={props.onResolveReview}
          onRestartStep={restartStep}
          onSubmitReview={props.onSubmitReview}
          selected={selected}
          visualDebug={
            selected.item.episodeId
              ? props.visualDebugByEpisode[selected.item.episodeId]
              : undefined
          }
        />
      ) : null}
    </section>
  );
}

function usePipelineQueues(): {
  data: PipelineQueuesResponse | null;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [data, setData] = useState<PipelineQueuesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await getJson<PipelineQueuesResponse>(
        '/api/pipeline/queues',
      );
      setData(payload);
      setError(payload.status === 'error' ? payload.message : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Queue refresh failed');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return { data, error, reload: load };
}

function Metric(props: { label: string; value: number }) {
  return (
    <div className="queue-metric">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function QueueColumn<T extends { key: string }>(props: {
  title: string;
  description: string;
  lane: PipelineQueueLane<T>;
  onSelect: (key: string) => void;
  renderItem: (item: T) => ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="queue-column">
      <header>
        <h3>{props.title}</h3>
        <span>{props.description}</span>
      </header>
      <QueueSection
        items={props.lane.processing}
        label="PROCESSING"
        onSelect={props.onSelect}
        renderItem={props.renderItem}
      />
      <QueueSection
        items={props.lane.queued}
        label="IN QUEUE"
        onSelect={props.onSelect}
        renderItem={props.renderItem}
      />
      {props.lane.attention.length > 0 ? (
        <QueueSection
          items={props.lane.attention}
          label="ATTENTION"
          onSelect={props.onSelect}
          renderItem={props.renderItem}
        />
      ) : null}
      {props.children}
    </section>
  );
}

/**
 * Closed episodes still hold failed rows in the durable queue. Hiding them
 * outright would make the board disagree with the database; leaving them in
 * ATTENTION buried the handful of jobs an operator can still rescue.
 */
function AbandonedSection(props: {
  items: PipelineQueueItem[];
  onSelect: (key: string) => void;
}) {
  if (props.items.length === 0) {
    return null;
  }
  return (
    <details className="queue-abandoned">
      <summary>Abandoned ({props.items.length})</summary>
      {props.items.map((item) => (
        <button
          className="queue-card-button"
          key={item.key}
          onClick={() => props.onSelect(item.key)}
          type="button"
        >
          <WorkCard item={item} />
        </button>
      ))}
    </details>
  );
}

function QueueSection<T extends { key: string }>(props: {
  label: string;
  items: T[];
  onSelect: (key: string) => void;
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <div className="queue-section">
      <div className="queue-section-label">
        <span>{props.label}</span>
        <strong>{props.items.length}</strong>
      </div>
      {props.items.length === 0 ? (
        <div className="queue-empty">None</div>
      ) : (
        props.items.map((item) => (
          <button
            className="queue-card-button"
            key={item.key}
            onClick={() => props.onSelect(item.key)}
            type="button"
          >
            {props.renderItem(item)}
          </button>
        ))
      )}
    </div>
  );
}

function CardHeader(props: {
  title: string;
  episodeId: string | undefined;
  badge: ReactNode;
}) {
  return (
    <>
      <div className="queue-card-title-row">
        <strong>{props.title}</strong>
        {props.badge}
      </div>
      <code>{props.episodeId ?? 'no episode row'}</code>
    </>
  );
}

function WorkCard({ item }: { item: PipelineQueueItem }) {
  const KindIcon = KIND_ICONS[item.kind];
  return (
    <article className={`queue-card queue-card-${item.state}`}>
      {item.thumbnailUrl ? (
        <img
          alt=""
          className="queue-thumb"
          loading="lazy"
          src={item.thumbnailUrl}
        />
      ) : null}
      <CardHeader
        badge={item.languageCode ? <span>{item.languageCode}</span> : null}
        episodeId={item.episodeId}
        title={item.title}
      />
      <div className="queue-card-step">
        <strong>
          <KindIcon aria-hidden="true" size={13} />
          {item.currentStep ?? kindLabel(item.kind)}
        </strong>
        <StateBadge state={item.state} />
      </div>
      {typeof item.progressPercent === 'number' ? (
        <div className="queue-progress-row">
          <div
            className="queue-progress"
            aria-label={`${item.progressPercent}%`}
          >
            <span style={{ width: `${clampPercent(item.progressPercent)}%` }} />
          </div>
          <small>{clampPercent(item.progressPercent)}%</small>
        </div>
      ) : null}
      {/* Without this line the operator has to open every failed card to learn
          whether thirty of them died of the same thing. */}
      {item.lastError ? (
        <small className="queue-card-error">
          {compactError(item.lastError)}
        </small>
      ) : null}
      <div className="queue-card-meta">
        {item.workerId ? <span>worker · {item.workerId}</span> : null}
        {item.startedAt ? (
          <span>{durationSince(item.startedAt)} elapsed</span>
        ) : null}
        {!item.startedAt && item.queuedAt ? (
          <span>{durationSince(item.queuedAt)} waiting</span>
        ) : null}
        {item.retryCount > 0 ? <span>retry {item.retryCount}</span> : null}
      </div>
    </article>
  );
}

function SocialCard({ item }: { item: SocialQueueItem }) {
  return (
    <article
      className={`queue-card social-queue-card queue-card-${item.state}`}
    >
      <CardHeader
        badge={<StateBadge state={item.state} />}
        episodeId={item.episodeId}
        title={item.title}
      />
      <div className="social-schedule">
        {item.contentType} · {formatDateTime(item.scheduledAt)}
      </div>
      <div className="social-platforms">
        {item.platforms.map((lane) => (
          <span
            className={`social-chip social-status-${lane.status}`}
            key={`${lane.platform}:${lane.languageCode}`}
            title={`${PLATFORM_LABELS[lane.platform]} · ${lane.languageCode} · ${lane.status}`}
          >
            {PLATFORM_LABELS[lane.platform]}
            <small>{lane.languageCode}</small>
          </span>
        ))}
      </div>
    </article>
  );
}

const KIND_ICONS: Record<PipelineQueueItem['kind'], typeof Languages> = {
  ingest: Languages,
  visual: Images,
  render: Clapperboard,
};

function StateBadge({ state }: { state: string }) {
  return <span className={`queue-state queue-state-${state}`}>{state}</span>;
}

function findSelected(
  data: PipelineQueuesResponse,
  key: string,
): SelectedQueueEntry | null {
  for (const kind of ['api', 'render'] as const) {
    for (const bucket of [
      'processing',
      'queued',
      'attention',
      'abandoned',
    ] as const) {
      const item = data[kind][bucket]?.find(
        (candidate) => candidate.key === key,
      );
      if (item) {
        return { kind, item };
      }
    }
  }
  for (const bucket of ['processing', 'queued', 'attention'] as const) {
    const item = data.social[bucket].find((candidate) => candidate.key === key);
    if (item) {
      return { kind: 'social', item };
    }
  }
  return null;
}

function filterLane<T extends { title: string; episodeId?: string }>(
  lane: PipelineQueueLane<T>,
  query: string,
): PipelineQueueLane<T> {
  const matches = (item: T) => itemMatches(item.title, item.episodeId, query);
  return {
    processing: lane.processing.filter(matches),
    queued: lane.queued.filter(matches),
    attention: lane.attention.filter(matches),
    ...(lane.abandoned ? { abandoned: lane.abandoned.filter(matches) } : {}),
  };
}

export function itemMatches(
  title: string,
  episodeId: string | undefined,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) {
    return true;
  }
  if (title.toLocaleLowerCase().includes(query)) {
    return true;
  }
  return Boolean(episodeId?.toLocaleLowerCase().includes(query));
}

function kindLabel(kind: PipelineQueueItem['kind']): string {
  if (kind === 'ingest') {
    return 'Ingest';
  }
  if (kind === 'visual') {
    return 'Visual planning';
  }
  return 'Rendering';
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function durationSince(value: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
