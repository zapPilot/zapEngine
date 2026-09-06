import type {
  PipelinePublishedLink,
  PipelineQueueHistoryEvent,
  PipelineQueueItem,
  PipelineQueueLane,
  PipelineQueueState,
} from '../../shared/pipeline-queues.js';

export interface EpisodeRenderQueueItem {
  key: string;
  episodeId?: string;
  title: string;
  state: PipelineQueueState;
  jobs: PipelineQueueItem[];
  visual?: PipelineQueueItem;
  renders: PipelineQueueItem[];
  queuedAt?: string;
  updatedAt?: string;
  lastError?: string;
  thumbnailUrl?: string;
  history: PipelineQueueHistoryEvent[];
  publishedLinks: PipelinePublishedLink[];
}

export function aggregateRenderLane(
  lane: PipelineQueueLane<PipelineQueueItem>,
): PipelineQueueLane<EpisodeRenderQueueItem> {
  const active = groupEpisodeWork([
    ...lane.processing,
    ...lane.queued,
    ...lane.attention,
  ]);

  return {
    processing: active.filter((item) => item.state === 'processing'),
    queued: active.filter(
      (item) =>
        item.state !== 'processing' &&
        item.state !== 'failed' &&
        item.state !== 'blocked',
    ),
    attention: active.filter(
      (item) => item.state === 'failed' || item.state === 'blocked',
    ),
    abandoned: groupEpisodeWork(lane.abandoned ?? []),
  };
}

function groupEpisodeWork(items: PipelineQueueItem[]): EpisodeRenderQueueItem[] {
  const groups = new Map<string, PipelineQueueItem[]>();

  for (const item of items) {
    const key = item.episodeId ?? item.key;
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return [...groups.values()]
    .map(toEpisodeItem)
    .sort((a, b) => time(a.queuedAt) - time(b.queuedAt));
}

function toEpisodeItem(jobs: PipelineQueueItem[]): EpisodeRenderQueueItem {
  const sortedJobs = [...jobs].sort(compareJobs);
  const first = sortedJobs[0]!;
  const visual = sortedJobs.find((item) => item.kind === 'visual');
  const renders = sortedJobs.filter((item) => item.kind === 'render');
  const episodeId = first.episodeId;
  const errors = sortedJobs
    .filter((item) => item.lastError)
    .sort((a, b) => stateRank(b.state) - stateRank(a.state));

  return {
    key: episodeId ? `episode:${episodeId}` : `episode:${first.key}`,
    ...(episodeId ? { episodeId } : {}),
    title: first.title,
    state: aggregateState(sortedJobs),
    jobs: sortedJobs,
    ...(visual ? { visual } : {}),
    renders,
    ...optionalDate('queuedAt', earliest(sortedJobs.map((item) => item.queuedAt))),
    ...optionalDate('updatedAt', latest(sortedJobs.map((item) => item.updatedAt))),
    ...(errors[0]?.lastError ? { lastError: errors[0].lastError } : {}),
    ...(renders.find((item) => item.thumbnailUrl)?.thumbnailUrl
      ? {
          thumbnailUrl: renders.find((item) => item.thumbnailUrl)!.thumbnailUrl,
        }
      : {}),
    history: uniqueHistory(sortedJobs.flatMap((item) => item.history)),
    publishedLinks: uniqueLinks(
      sortedJobs.flatMap((item) => item.publishedLinks),
    ),
  };
}

function aggregateState(items: PipelineQueueItem[]): PipelineQueueState {
  return [...items].sort(
    (a, b) => stateRank(b.state) - stateRank(a.state),
  )[0]!.state;
}

function stateRank(state: PipelineQueueState): number {
  switch (state) {
    case 'failed':
      return 6;
    case 'blocked':
      return 5;
    case 'processing':
      return 4;
    case 'retrying':
      return 3;
    case 'queued':
      return 2;
    case 'completed':
      return 1;
  }
}

function compareJobs(a: PipelineQueueItem, b: PipelineQueueItem): number {
  if (a.kind === 'visual' && b.kind !== 'visual') {
    return -1;
  }
  if (b.kind === 'visual' && a.kind !== 'visual') {
    return 1;
  }
  return languageRank(a.languageCode) - languageRank(b.languageCode);
}

function languageRank(languageCode: string | undefined): number {
  const order = ['zh-Hant', 'ja', 'en'];
  const index = languageCode ? order.indexOf(languageCode) : -1;
  return index >= 0 ? index : order.length;
}

function earliest(values: Array<string | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b))[0];
}

function latest(values: Array<string | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0];
}

function optionalDate<K extends 'queuedAt' | 'updatedAt'>(
  key: K,
  value: string | undefined,
): Partial<Record<K, string>> {
  return value ? ({ [key]: value } as Partial<Record<K, string>>) : {};
}

function uniqueHistory(
  events: PipelineQueueHistoryEvent[],
): PipelineQueueHistoryEvent[] {
  const seen = new Set<string>();
  return events
    .filter((event) => {
      const key = `${event.at}:${event.label}:${event.detail ?? ''}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

function uniqueLinks(links: PipelinePublishedLink[]): PipelinePublishedLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.platform}:${link.languageCode}:${link.publishedAt}:${link.url ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function time(value: string | undefined): number {
  return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
}
