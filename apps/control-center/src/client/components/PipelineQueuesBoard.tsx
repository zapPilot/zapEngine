import { ExternalLink, Search, X as CloseIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type {
  PipelinePublishedLink,
  PipelineQueueItem,
  PipelineQueueLane,
  PipelineQueuesResponse,
  SocialPlatform,
  SocialQueueItem,
} from '../../shared/pipeline-queues.js';
import './PipelineQueuesBoard.css';

const POLL_MS = 7_000;
const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  x: 'X',
  threads: 'Threads',
  rednote: 'Rednote',
  youtube: 'YouTube',
};

type Selected =
  | { kind: 'api' | 'render'; item: PipelineQueueItem }
  | { kind: 'social'; item: SocialQueueItem };

export function PipelineQueuesBoard() {
  const [data, setData] = useState<PipelineQueuesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/pipeline/queues');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as PipelineQueuesResponse;
        if (!cancelled) {
          setData(payload);
          setError(payload.status === 'error' ? payload.message : null);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Queue refresh failed');
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const selected = useMemo(
    () => (data && selectedKey ? findSelected(data, selectedKey) : null),
    [data, selectedKey],
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
          lane={filterLane(data.render, query)}
          onSelect={setSelectedKey}
          renderItem={(item) => <WorkCard item={item} />}
          title="Render queue"
        />
        <QueueColumn
          description="social:daemon"
          lane={filterSocialLane(data.social, query)}
          onSelect={setSelectedKey}
          renderItem={(item) => <SocialCard item={item} />}
          title="Social publishing"
        />
      </div>

      {selected ? (
        <QueueDrawer onClose={() => setSelectedKey(null)} selected={selected} />
      ) : null}
    </section>
  );
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
    </section>
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

function WorkCard({ item }: { item: PipelineQueueItem }) {
  return (
    <article className="queue-card">
      {item.thumbnailUrl ? (
        <img alt="" className="queue-thumb" src={item.thumbnailUrl} />
      ) : null}
      <div className="queue-card-title-row">
        <strong>{item.title}</strong>
        {item.languageCode ? <span>{item.languageCode}</span> : null}
      </div>
      <code>{item.episodeId}</code>
      <div className="queue-card-step">
        <strong>{item.currentStep ?? kindLabel(item.kind)}</strong>
        <StateBadge state={item.state} />
      </div>
      {typeof item.progressPercent === 'number' ? (
        <div className="queue-progress" aria-label={`${item.progressPercent}%`}>
          <span style={{ width: `${clampPercent(item.progressPercent)}%` }} />
        </div>
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
    <article className="queue-card social-queue-card">
      <div className="queue-card-title-row">
        <strong>{item.title}</strong>
        <StateBadge state={item.state} />
      </div>
      <code>{item.episodeId}</code>
      <div className="social-schedule">
        {item.contentType} · {formatDateTime(item.scheduledAt)}
      </div>
      <div className="social-platforms">
        {item.platforms.map((lane) => (
          <div
            className="social-platform-row"
            key={`${lane.platform}:${lane.languageCode}`}
          >
            <span>
              {PLATFORM_LABELS[lane.platform]} · {lane.languageCode}
            </span>
            <span className={`social-status social-status-${lane.status}`}>
              {lane.status}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function StateBadge({ state }: { state: string }) {
  return <span className={`queue-state queue-state-${state}`}>{state}</span>;
}

function QueueDrawer(props: { selected: Selected; onClose: () => void }) {
  const { item } = props.selected;
  const isSocial = props.selected.kind === 'social';
  return (
    <aside className="queue-drawer" aria-label="Episode queue details">
      <header className="queue-drawer-head">
        <div>
          <span>{props.selected.kind.toUpperCase()} QUEUE</span>
          <h3>{item.title}</h3>
          <code>{item.episodeId}</code>
        </div>
        <button aria-label="Close details" onClick={props.onClose} type="button">
          <CloseIcon size={18} />
        </button>
      </header>

      <DrawerSection title="Current state">
        {isSocial ? (
          <SocialCurrentState item={item as SocialQueueItem} />
        ) : (
          <WorkCurrentState item={item as PipelineQueueItem} />
        )}
      </DrawerSection>

      <DrawerSection title="Queue history">
        {item.history.length === 0 ? (
          <span className="drawer-muted">No reliable persisted history.</span>
        ) : (
          <ol className="queue-history">
            {item.history.map((event, index) => (
              <li key={`${event.at}:${event.label}:${index}`}>
                <time>{formatDateTime(event.at)}</time>
                <strong>{event.label}</strong>
                {event.detail && !event.detail.startsWith('http') ? (
                  <span>{event.detail}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </DrawerSection>

      {!isSocial && (item as PipelineQueueItem).lastError ? (
        <DrawerSection title="Last error">
          <pre className="queue-error-detail">
            {(item as PipelineQueueItem).lastError}
          </pre>
        </DrawerSection>
      ) : null}

      <DrawerSection title="Published social posts">
        <PublishedLinks links={item.publishedLinks} />
      </DrawerSection>
    </aside>
  );
}

function WorkCurrentState({ item }: { item: PipelineQueueItem }) {
  return (
    <dl className="queue-detail-list">
      <div>
        <dt>State</dt>
        <dd>
          <StateBadge state={item.state} />
        </dd>
      </div>
      <div>
        <dt>Step</dt>
        <dd>{item.currentStep ?? kindLabel(item.kind)}</dd>
      </div>
      {item.languageCode ? (
        <div>
          <dt>Language</dt>
          <dd>{item.languageCode}</dd>
        </div>
      ) : null}
      {item.workerId ? (
        <div>
          <dt>Worker</dt>
          <dd>{item.workerId}</dd>
        </div>
      ) : null}
      {typeof item.progressPercent === 'number' ? (
        <div>
          <dt>Progress</dt>
          <dd>{item.progressPercent}%</dd>
        </div>
      ) : null}
      <div>
        <dt>Retries</dt>
        <dd>{item.retryCount}</dd>
      </div>
    </dl>
  );
}

function SocialCurrentState({ item }: { item: SocialQueueItem }) {
  return (
    <div className="drawer-social-lanes">
      {item.platforms.map((lane) => (
        <div key={`${lane.platform}:${lane.languageCode}`}>
          <div>
            <strong>{PLATFORM_LABELS[lane.platform]}</strong>
            <span>{lane.languageCode}</span>
            <span className={`social-status social-status-${lane.status}`}>
              {lane.status}
            </span>
          </div>
          {lane.workerId ? <small>worker · {lane.workerId}</small> : null}
          {lane.error ? (
            <small className="queue-lane-error">{lane.error}</small>
          ) : null}
          {lane.url ? (
            <a href={lane.url} rel="noreferrer" target="_blank">
              Open post <ExternalLink size={13} />
            </a>
          ) : lane.status === 'published' ? (
            <small>Published · link unavailable</small>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PublishedLinks({ links }: { links: PipelinePublishedLink[] }) {
  if (links.length === 0) {
    return <span className="drawer-muted">No published posts yet.</span>;
  }
  return (
    <div className="published-links">
      {links.map((link) => (
        <div key={`${link.platform}:${link.languageCode}:${link.publishedAt}`}>
          <div>
            <strong>{PLATFORM_LABELS[link.platform]}</strong>
            <span>{link.languageCode}</span>
          </div>
          {link.url ? (
            <a href={link.url} rel="noreferrer" target="_blank">
              {link.url} <ExternalLink size={13} />
            </a>
          ) : (
            <span>Published · link unavailable</span>
          )}
        </div>
      ))}
    </div>
  );
}

function DrawerSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="queue-drawer-section">
      <h4>{props.title}</h4>
      {props.children}
    </section>
  );
}

function findSelected(
  data: PipelineQueuesResponse,
  key: string,
): Selected | null {
  for (const kind of ['api', 'render'] as const) {
    for (const bucket of ['processing', 'queued', 'attention'] as const) {
      const item = data[kind][bucket].find(
        (candidate) => candidate.key === key,
      );
      if (item) return { kind, item };
    }
  }
  for (const bucket of ['processing', 'queued', 'attention'] as const) {
    const item = data.social[bucket].find(
      (candidate) => candidate.key === key,
    );
    if (item) return { kind: 'social', item };
  }
  return null;
}

function filterLane(
  lane: PipelineQueueLane<PipelineQueueItem>,
  query: string,
): PipelineQueueLane<PipelineQueueItem> {
  const matches = (item: PipelineQueueItem) =>
    itemMatches(item.title, item.episodeId, query);
  return {
    processing: lane.processing.filter(matches),
    queued: lane.queued.filter(matches),
    attention: lane.attention.filter(matches),
  };
}

function filterSocialLane(
  lane: PipelineQueueLane<SocialQueueItem>,
  query: string,
): PipelineQueueLane<SocialQueueItem> {
  const matches = (item: SocialQueueItem) =>
    itemMatches(item.title, item.episodeId, query);
  return {
    processing: lane.processing.filter(matches),
    queued: lane.queued.filter(matches),
    attention: lane.attention.filter(matches),
  };
}

export function itemMatches(
  title: string,
  episodeId: string,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;
  return (
    title.toLocaleLowerCase().includes(query) ||
    episodeId.toLocaleLowerCase().includes(query)
  );
}

function kindLabel(kind: PipelineQueueItem['kind']): string {
  if (kind === 'ingest') return 'Ingest';
  if (kind === 'visual') return 'Visual planning';
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
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
