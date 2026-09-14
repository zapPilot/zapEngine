import { CircleDollarSign, Send, Workflow } from 'lucide-react';

import type {
  PipelineQueueItem,
  PipelineQueuesResponse,
  SocialPlatform,
  SocialQueueItem,
} from '../../shared/pipeline-queues.js';
import {
  type PodcastCostEvidenceTotals,
  podcastCostEvidenceTotals,
} from '../../shared/podcast-cost-evidence.js';
import type { PodcastCostResponse } from '../../shared/types.js';
import { BarRows, type BarRow } from '../components/ui/BarRows.js';
import { Card } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { FlowBand, type FlowStage } from '../components/ui/FlowBand.js';
import { Pill } from '../components/ui/Pill.js';
import { Stat } from '../components/ui/Stat.js';
import { integer, percent, usd } from '../format.js';
import {
  evidenceAmountText,
  FAILED_ATTEMPT_SHARE_DANGER,
  failedAttemptCost,
} from '../operator-model.js';
import { PlatformIdentity } from '../platform.js';
import { QueuePanel } from '../queue-availability.js';

const PLATFORMS: SocialPlatform[] = ['x', 'threads', 'rednote', 'youtube'];

/**
 * The stages the runtime queues can actually tell apart.
 *
 * Translation and TTS are not separate stages here even though they are
 * separate steps: both run inside one ingest job, and the queue reports that
 * job as a whole. Splitting the box without splitting the job would invent a
 * count for each half.
 */
const STAGES = [
  { id: 'ingest', label: '擷取 / 翻譯 / TTS', lane: 'api' as const },
  {
    id: 'visual-plan',
    label: '視覺規劃',
    lane: 'render' as const,
    steps: ['analyzing-audio', 'planning-scenes'],
  },
  {
    id: 'visual-images',
    label: '圖片搜尋',
    lane: 'render' as const,
    steps: ['selecting-images', 'uploading-visuals'],
  },
  { id: 'render', label: 'Render', lane: 'render' as const, kind: 'render' },
  { id: 'social', label: '社群發佈', lane: 'social' as const },
];

export function PipelineSummary(props: {
  podcastCosts: PodcastCostResponse | null;
  queues: PipelineQueuesResponse | null;
}) {
  return (
    <div className="cc-stack">
      <Card
        icon={Workflow}
        subtitle="Items in flight per stage, from the runtime queues"
        title="整體流程狀態"
        tone="accent"
      >
        <StageMap queues={props.queues} />
      </Card>

      <div className="cc-grid rel-main">
        <Card
          icon={Send}
          subtitle="Publish lanes across the queued releases"
          title="社群發佈狀態"
          tone="info"
        >
          <PublishStatus queues={props.queues} />
        </Card>

        <Card
          icon={CircleDollarSign}
          subtitle="Priced stages whose run failed — not confirmed retry waste"
          title="失敗嘗試成本"
          tone="warning"
        >
          <FailedAttemptCostCard podcastCosts={props.podcastCosts} />
        </Card>
      </div>
    </div>
  );
}

function StageMap(props: { queues: PipelineQueuesResponse | null }) {
  return <QueuePanel queues={props.queues}>{renderStages}</QueuePanel>;
}

function renderStages(queues: PipelineQueuesResponse) {
  const stages: FlowStage[] = STAGES.map((stage) => {
    const items = stageItems(queues, stage);
    const stuck = items.filter(
      (item) => item.state === 'blocked' || item.state === 'failed',
    ).length;
    return {
      // An arrow, because these are sequential stages of one pipeline — but
      // never a rate: the counts are concurrent occupancy, not a cohort moving
      // through, so a ratio between two boxes would mean nothing.
      id: stage.id,
      label: stage.label,
      note: stuck > 0 ? `${integer(stuck)} 需介入` : undefined,
      tone: stuck > 0 ? 'danger' : items.length > 0 ? 'accent' : 'neutral',
      value: integer(items.length),
    };
  });
  return (
    <>
      <FlowBand stages={stages} />
      <p className="pipe-note">
        每一格是目前在該階段的工作項目數，不是產能上限。翻譯與 TTS
        在同一個擷取工作內執行，佇列無法把它們分開計數。
      </p>
    </>
  );
}

function stageItems(
  queues: PipelineQueuesResponse,
  stage: (typeof STAGES)[number],
): Array<PipelineQueueItem | SocialQueueItem> {
  if (stage.lane === 'social') {
    return [
      ...queues.social.processing,
      ...queues.social.queued,
      ...queues.social.attention,
    ];
  }
  const lane = stage.lane === 'api' ? queues.api : queues.render;
  const all = [...lane.processing, ...lane.queued, ...lane.attention];
  if (stage.kind) {
    return all.filter((item) => item.kind === stage.kind);
  }
  if (stage.steps) {
    return all.filter(
      (item) =>
        item.kind === 'visual' &&
        stage.steps.includes((item.currentStep ?? '').toLowerCase()),
    );
  }
  return all;
}

/** Per-platform publish state across every release the queue is holding. */
function PublishStatus(props: { queues: PipelineQueuesResponse | null }) {
  const queues = props.queues;
  if (queues?.status !== 'ok') {
    return (
      <EmptyState
        detail={queues?.message ?? '佇列尚未載入。'}
        title="No publish state"
      />
    );
  }
  const items = [
    ...queues.social.processing,
    ...queues.social.queued,
    ...queues.social.attention,
  ];
  if (items.length === 0) {
    return (
      <EmptyState
        detail="沒有排程中或發佈中的內容。已發佈的集數不再留在佇列裡。"
        title="佇列是空的"
      />
    );
  }
  const lanes = items.flatMap((item) => item.platforms);
  return (
    <div className="pipe-publish">
      {PLATFORMS.map((platform) => {
        const own = lanes.filter((lane) => lane.platform === platform);
        const published = own.filter(
          (lane) => lane.status === 'published',
        ).length;
        const failed = own.filter((lane) => lane.status === 'failed').length;
        const pending = own.length - published - failed;
        return (
          <div className="pipe-publish-row" key={platform}>
            <PlatformIdentity platform={platform} />
            <span className="pipe-publish-counts">
              已發佈 {integer(published)} · 等待 {integer(pending)}
            </span>
            {failed > 0 ? <Pill tone="danger">失敗 {failed}</Pill> : null}
          </div>
        );
      })}
      <p className="pipe-note">
        統計範圍是佇列裡 {integer(items.length)}{' '}
        個尚未收尾的發佈，不是全部歷史。
      </p>
    </div>
  );
}

/**
 * Failed-attempt cost is what the ledger can actually prove: priced stages
 * belonging to a run that failed. Whether that work then ran again is a
 * separate, weaker claim, so confirmed retry waste sits beside it rather than
 * replacing it — and stays `Unknown` where no lineage was recorded.
 */
function FailedAttemptCostCard(props: {
  podcastCosts: PodcastCostResponse | null;
}) {
  const failed = failedAttemptCost(props.podcastCosts);
  if (failed.costUsd === null) {
    return (
      <EmptyState
        detail={props.podcastCosts?.message ?? '成本 ledger 尚未載入。'}
        title="Ledger unavailable"
      />
    );
  }
  const evidence = podcastCostEvidenceTotals(
    props.podcastCosts?.episodes ?? [],
  );
  return (
    <div className="cc-stack">
      <div className="pipe-waste-top">
        <Stat
          caption="of all episode spend (podcast + video)"
          label="Failed-attempt share"
          tone={
            failed.share !== null && failed.share > FAILED_ATTEMPT_SHARE_DANGER
              ? 'danger'
              : 'neutral'
          }
          value={percent(failed.share)}
        />
        <Stat
          caption="Already inside total spend; the run failed, the work may not have re-run"
          label="Failed-attempt cost"
          value={usd(failed.costUsd)}
        />
        <Stat
          caption={lineageCaption(evidence)}
          label="Confirmed retry waste"
          tone={
            (evidence.confirmedRetryWaste.usd ?? 0) > 0 ? 'warning' : 'neutral'
          }
          value={evidenceAmountText(evidence.confirmedRetryWaste)}
        />
        <Stat
          caption={interruptionCaption(evidence)}
          label="Interrupted attempts"
          tone={
            (evidence.interruptedAttemptCost.usd ?? 0) > 0
              ? 'warning'
              : 'neutral'
          }
          value={evidenceAmountText(evidence.interruptedAttemptCost)}
        />
      </div>
      <BarRows rows={failedAttemptRows(props.podcastCosts)} />
    </div>
  );
}

function lineageCaption(evidence: PodcastCostEvidenceTotals): string {
  if (evidence.confirmedRetryWaste.usd === null) {
    return 'No render lineage recorded for these episodes';
  }
  if (evidence.confirmedRetryWaste.lowerBound) {
    return `${integer(evidence.unknownLineageStages)} priced render stages predate lineage`;
  }
  return 'Every priced render stage has lineage';
}

function interruptionCaption(evidence: PodcastCostEvidenceTotals): string {
  const interrupted = evidence.interruptedAttemptCost;
  if (interrupted.usd !== null && interrupted.usd > 0) {
    return `Deploy ${usd(evidence.deploymentInterruptionCostUsd)} · other shutdown ${usd(evidence.shutdownInterruptionCostUsd)}`;
  }
  if (interrupted.usd === null || interrupted.lowerBound) {
    return `${integer(evidence.unknownFailureReasonStages)} failed stages carry no failure reason`;
  }
  return 'Every failed stage carries a reason';
}

/** The episodes carrying the most failed-attempt cost, so the ranking points at
 * work that can actually be investigated rather than at a single aggregate. */
function failedAttemptRows(data: PodcastCostResponse | null): BarRow[] {
  return (data?.episodes ?? [])
    .filter((episode) => episode.failedAttemptCostUsd > 0)
    .sort(
      (left, right) => right.failedAttemptCostUsd - left.failedAttemptCostUsd,
    )
    .slice(0, 5)
    .map((episode) => ({
      id: episode.episodeId,
      label: episode.title ?? episode.episodeId,
      value: usd(episode.failedAttemptCostUsd),
      weight: episode.failedAttemptCostUsd,
    }));
}
