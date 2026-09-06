import {
  ArchiveX,
  ExternalLink,
  X as CloseIcon,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import type {
  PipelinePublishedLink,
  PipelineQueueItem,
  SocialPlatform,
  SocialQueueItem,
} from '../../shared/pipeline-queues.js';
import type { PodcastPipelineRestartAction } from '../../shared/podcast-pipeline.js';
import type {
  PodcastVisualDebugResponse,
  PodcastVisualReviewHandlers,
} from '../../shared/podcast-visual.js';
import { compactError, relativeTime } from '../format.js';
import { CopyableId } from './CopyableId.js';
import './QueueDrawer.css';
import { VisualEvidence } from './VisualEvidence.js';

export type SelectedQueueEntry =
  | { kind: 'api' | 'render'; item: PipelineQueueItem }
  | { kind: 'social'; item: SocialQueueItem };

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  x: 'X',
  threads: 'Threads',
  rednote: 'Rednote',
  youtube: 'YouTube',
};

type DrawerTab = 'overview' | 'scenes' | 'history';

export function QueueDrawer(
  props: PodcastVisualReviewHandlers & {
    selected: SelectedQueueEntry;
    visualDebug: PodcastVisualDebugResponse | undefined;
    onRestartStep: (
      episodeId: string,
      action: PodcastPipelineRestartAction,
    ) => Promise<void>;
    onAbandonEpisode: (episodeId: string) => Promise<void>;
    onClose: () => void;
  },
) {
  const { item } = props.selected;
  const isSocial = props.selected.kind === 'social';
  const [tab, setTab] = useState<DrawerTab>('overview');
  const [restartError, setRestartError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);
  const [abandoning, setAbandoning] = useState(false);

  const { onClose } = props;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A different job answers different questions, and a half-armed re-plan must
  // not survive the switch.
  const selectionKey = item.key;
  useEffect(() => {
    setTab('overview');
    setRestartError(null);
    setAbandonError(null);
  }, [selectionKey]);

  const episodeId = item.episodeId;
  const runRestart = async (action: PodcastPipelineRestartAction) => {
    if (!episodeId) {
      return;
    }
    setRestarting(true);
    setRestartError(null);
    try {
      await props.onRestartStep(episodeId, action);
    } catch (cause) {
      setRestartError(cause instanceof Error ? cause.message : 'Retry failed');
    } finally {
      setRestarting(false);
    }
  };

  const runAbandon = async () => {
    if (!episodeId || !canAbandon(props.selected)) {
      return;
    }
    const confirmed = window.confirm(
      'Abandon this episode video job? It will leave the active render lanes, keep its failure history, and block retries.',
    );
    if (!confirmed) {
      return;
    }

    setAbandoning(true);
    setAbandonError(null);
    try {
      await props.onAbandonEpisode(episodeId);
      props.onClose();
    } catch (cause) {
      setAbandonError(
        cause instanceof Error ? cause.message : 'Abandon failed',
      );
    } finally {
      setAbandoning(false);
    }
  };

  // Scenes stays available for social work too: the episodes whose images are
  // worth arguing about are the ones that already rendered and are queued to
  // publish, and they only ever appear in the social lane.
  const tabs: DrawerTab[] = episodeId
    ? ['overview', 'scenes', 'history']
    : ['overview', 'history'];

  return (
    <aside className="queue-drawer" aria-label="Episode queue details">
      <header className="queue-drawer-head">
        <div>
          <span>{props.selected.kind.toUpperCase()} QUEUE</span>
          <h3>{item.title}</h3>
          {item.episodeId ? (
            <CopyableId label="episode id" value={item.episodeId} />
          ) : (
            <code>no episode row</code>
          )}
        </div>
        <button aria-label="Close details" onClick={onClose} type="button">
          <CloseIcon size={18} />
        </button>
      </header>

      <nav className="queue-drawer-tabs" aria-label="Episode detail sections">
        {tabs.map((name) => (
          <button
            aria-current={tab === name ? 'page' : undefined}
            className={tab === name ? 'is-active' : undefined}
            key={name}
            onClick={() => setTab(name)}
            type="button"
          >
            {TAB_LABELS[name]}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <>
          {isSocial ? null : (
            <DrawerSection title="Recovery">
              <RecoveryActions
                abandonBusy={abandoning}
                abandonError={abandonError}
                busy={restarting}
                canAbandon={canAbandon(props.selected)}
                error={restartError}
                item={item as PipelineQueueItem}
                onAbandon={() => void runAbandon()}
                onRestart={runRestart}
              />
            </DrawerSection>
          )}
          <DrawerSection title="Current state">
            {isSocial ? (
              <SocialCurrentState item={item as SocialQueueItem} />
            ) : (
              <WorkCurrentState item={item as PipelineQueueItem} />
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
        </>
      ) : null}

      {tab === 'scenes' && episodeId ? (
        <div className="queue-drawer-scenes">
          <VisualEvidence
            data={props.visualDebug}
            episodeId={episodeId}
            forceReplanBusy={restarting}
            onLoadVisualDebug={props.onLoadVisualDebug}
            onResolveReview={props.onResolveReview}
            onSubmitReview={props.onSubmitReview}
            pipelineDebug={props.visualDebug?.search ?? null}
            {...(canForceReplan(props.selected)
              ? {
                  onForceReplan: () =>
                    void runRestart({ step: 'video', forceReplan: true }),
                }
              : {})}
          />
        </div>
      ) : null}

      {tab === 'history' ? (
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
      ) : null}
    </aside>
  );
}

const TAB_LABELS: Record<DrawerTab, string> = {
  overview: 'Overview',
  scenes: 'Scenes',
  history: 'History',
};

/**
 * A re-plan is only worth offering once the queue side agrees the job is idle;
 * `VisualEvidence` then withholds the button unless the plan on screen is a
 * completed, current one, which is the only case a plain restart cannot fix.
 */
function canForceReplan(selected: SelectedQueueEntry): boolean {
  if (!selected.item.episodeId) {
    return false;
  }
  // A social item's episode has already rendered, so its video work is idle by
  // definition; a work item has to say so itself.
  if (selected.kind === 'social') {
    return true;
  }
  const item = selected.item;
  return !item.abandoned && item.state !== 'processing';
}

export function canAbandon(selected: SelectedQueueEntry): boolean {
  if (selected.kind !== 'render' || !selected.item.episodeId) {
    return false;
  }
  const item = selected.item;
  return (
    !item.abandoned && (item.state === 'blocked' || item.state === 'failed')
  );
}

function RecoveryActions(props: {
  item: PipelineQueueItem;
  busy: boolean;
  abandonBusy: boolean;
  canAbandon: boolean;
  error: string | null;
  abandonError: string | null;
  onRestart: (action: PodcastPipelineRestartAction) => void;
  onAbandon: () => void;
}) {
  const { actions } = props.item;
  return (
    <div className="queue-recovery">
      {actions.restart ? (
        <button
          className="refresh-button queue-retry"
          disabled={props.busy || props.abandonBusy}
          onClick={() =>
            props.onRestart(actions.restart as PodcastPipelineRestartAction)
          }
          type="button"
        >
          <RotateCcw aria-hidden="true" size={15} />
          {props.busy
            ? 'Restarting…'
            : restartLabel(actions.restart, props.item)}
        </button>
      ) : null}
      {actions.restart ? (
        <small className="queue-recovery-hint">
          {restartHint(actions.restart)}
        </small>
      ) : null}
      {props.canAbandon ? (
        <button
          className="refresh-button queue-retry queue-abandon"
          disabled={props.busy || props.abandonBusy}
          onClick={props.onAbandon}
          type="button"
        >
          <ArchiveX aria-hidden="true" size={15} />
          {props.abandonBusy ? 'Abandoning…' : 'Abandon episode'}
        </button>
      ) : null}
      {props.canAbandon ? (
        <small className="queue-recovery-hint">
          Removes this episode from active render lanes and blocks retries;
          failure history is preserved.
        </small>
      ) : null}
      {actions.disabledReason ? (
        <small className="queue-recovery-blocked">
          {actions.disabledReason}
        </small>
      ) : null}
      {props.error ? (
        <small className="queue-recovery-error">
          {compactError(props.error)}
        </small>
      ) : null}
      {props.abandonError ? (
        <small className="queue-recovery-error">
          {compactError(props.abandonError)}
        </small>
      ) : null}
    </div>
  );
}

export function restartLabel(
  action: PodcastPipelineRestartAction,
  item: PipelineQueueItem,
): string {
  if (action.step === 'ingest') {
    return 'Restart ingest';
  }
  if (action.step === 'render') {
    return `Retry ${item.languageCode ?? ''} render`.replace('  ', ' ');
  }
  return 'Restart video';
}

export function restartHint(action: PodcastPipelineRestartAction): string {
  if (action.step === 'ingest') {
    return 'Resumes translation and TTS from durable checkpoints.';
  }
  if (action.step === 'render') {
    return 'Requeues this language against the existing visual plan.';
  }
  return 'Re-plans the visual if needed, then requeues the unfinished renders.';
}

function WorkCurrentState({ item }: { item: PipelineQueueItem }) {
  return (
    <dl className="queue-detail-list">
      <div>
        <dt>State</dt>
        <dd>
          <span className={`queue-state queue-state-${item.state}`}>
            {item.state}
          </span>
        </dd>
      </div>
      <div>
        <dt>Step</dt>
        <dd>{item.currentStep ?? item.kind}</dd>
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
      {item.abandoned ? (
        <div>
          <dt>Abandoned</dt>
          <dd>
            {relativeTime(item.abandoned.at)} · {item.abandoned.reason}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function SocialCurrentState({ item }: { item: SocialQueueItem }) {
  return (
    <div className="drawer-social-lanes">
      <small className="drawer-muted">
        social:daemon retries these automatically; there is nothing to press.
      </small>
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
          {lane.nextAttemptAt && lane.status !== 'published' ? (
            <small>auto-retry at {formatDateTime(lane.nextAttemptAt)}</small>
          ) : null}
          {lane.retryCount > 0 ? <small>retry {lane.retryCount}</small> : null}
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

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
