import {
  Activity,
  Bot,
  CircleDollarSign,
  Lightbulb,
  TriangleAlert,
  Workflow,
} from 'lucide-react';

import type { AgentBacklogResponse } from '../../shared/agent-backlog.js';
import type {
  CostHistoryResponse,
  OperationalSignal,
  OperationsResponse,
  OverviewResponse,
  PodcastCostResponse,
} from '../../shared/types.js';
import { OperatorAudit } from '../components/OperatorAudit.js';
import { BarRows, type BarRow } from '../components/ui/BarRows.js';
import { Card } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { MiniBars } from '../components/ui/MiniBars.js';
import { Pill, StatusPill } from '../components/ui/Pill.js';
import { RankedList, type RankedItem } from '../components/ui/RankedList.js';
import { Stat } from '../components/ui/Stat.js';
import { statusTone } from '../components/ui/tone.js';
import { integer, percent, relativeTime, usd, usdWhole } from '../format.js';
import { retryWaste, statusText } from '../operator-model.js';
import { priorityItems } from '../priority-items.js';

/** A provider whose day is this much above its recent run rate is called out.
 * Below this, day-to-day noise on a $30/month bill would flag constantly. */
const ANOMALY_THRESHOLD = 0.25;

export function ReliabilityPage(props: {
  costHistory: CostHistoryResponse | null;
  data: OperationsResponse | null;
  overview: OverviewResponse | null;
  podcastCosts: PodcastCostResponse | null;
}) {
  const operations = props.data;
  const waste = retryWaste(props.podcastCosts);
  const fly = flyFleet(operations);
  const backlog = agentBacklog(operations);

  return (
    <div className="cc-stack">
      <Card
        icon={Activity}
        subtitle={`${integer(operations?.signals.length ?? 0)} signals across ${integer(operations?.domains.length ?? 0)} domains`}
        title="系統整體健康"
        tone={statusTone(operations?.status)}
      >
        <div className="rel-hero">
          <Stat
            aside={<StatusPill status={operations?.status} />}
            caption="Worst status across every source"
            label="Overall"
            size="sm"
            value={statusText(operations?.status)}
          />
          <Stat
            caption="Signals over the action threshold"
            label="Open interventions"
            tone={
              (operations?.priorities.length ?? 0) > 0 ? 'danger' : 'success'
            }
            value={integer(operations?.priorities.length ?? 0)}
          />
          <Stat caption={fly.caption} label="Fly services" value={fly.value} />
          <Stat
            caption="All providers, current month"
            label="Projected spend"
            value={usdWhole(props.overview?.projectedCostUsd)}
          />
        </div>
      </Card>

      <Card
        icon={Bot}
        subtitle="GitHub Issues is the work-item source of truth; Supabase only owns temporary agent leases"
        title="AI Backlog"
        tone="info"
      >
        {backlog?.status === 'ok' ? (
          <div className="cc-stack">
            <div className="rel-hero">
              <Stat
                caption="Available to claim"
                label="Ready"
                value={integer(backlog.ready)}
              />
              <Stat
                caption="Currently leased"
                label="Working"
                value={integer(backlog.working)}
              />
              <Stat
                caption="Needs stronger judgement"
                label="Blocked"
                value={integer(backlog.blocked)}
              />
              <Stat
                caption="Closed GitHub issues"
                label="Completed 7d"
                value={integer(backlog.completed7d)}
              />
            </div>
            <RankedList
              empty={
                <EmptyState
                  detail="沒有 agent-backlog issue 等待處理。"
                  title="Backlog is empty"
                />
              }
              items={backlogItems(backlog)}
            />
          </div>
        ) : (
          <EmptyState
            detail={backlog?.message ?? 'Backlog has not been loaded yet.'}
            title={
              backlog?.status === 'unconfigured'
                ? 'Backlog not configured'
                : 'Backlog unavailable'
            }
          />
        )}
      </Card>

      <div className="cc-grid rel-main">
        <Card
          icon={TriangleAlert}
          subtitle="Ranked by the priority engine"
          title="目前風險"
          tone="danger"
        >
          <RankedList
            empty={
              <EmptyState
                detail="沒有 signal 跨過 action threshold。"
                title="目前沒有風險"
              />
            }
            items={priorityItems(operations?.priorities ?? [], {
              detail: true,
              sourceLink: true,
            })}
          />
        </Card>

        <Card
          icon={Workflow}
          subtitle="Scheduled and recent GitHub Actions runs"
          title="工作流健康度"
          tone="info"
        >
          <WorkflowHealth operations={operations} />
        </Card>
      </div>

      <div className="cc-grid rel-main">
        <Card
          icon={CircleDollarSign}
          subtitle="Daily accrual and where it goes"
          title="成本總覽"
          tone="warning"
        >
          <CostOverview
            costHistory={props.costHistory}
            podcastCosts={props.podcastCosts}
            waste={waste}
          />
        </Card>

        <Card
          icon={Lightbulb}
          subtitle="Why the engine ranked these first"
          title="建議你現在做什麼"
          tone="accent"
        >
          <RankedList
            empty={
              <EmptyState
                detail="沒有待處理的建議。"
                title="No recommendation"
              />
            }
            items={adviceItems(operations)}
          />
        </Card>
      </div>

      <OperatorAudit refreshedAt={operations?.generatedAt} />
    </div>
  );
}

function agentBacklog(
  operations: OperationsResponse | null,
): AgentBacklogResponse | null {
  return operations?.agentBacklog ?? null;
}

function backlogItems(backlog: AgentBacklogResponse): RankedItem[] {
  return backlog.items.slice(0, 6).map((item) => ({
    id: `backlog-${item.issueNumber}`,
    title: item.title,
    detail: [
      item.status,
      item.area,
      item.claim ? `claimed by ${item.claim.agentId}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    tone:
      item.status === 'blocked'
        ? 'warning'
        : item.status === 'working'
          ? 'info'
          : 'accent',
    aside: (
      <a href={item.url} rel="noreferrer" target="_blank">
        #{item.issueNumber}
      </a>
    ),
  }));
}

function adviceItems(operations: OperationsResponse | null): RankedItem[] {
  return (operations?.priorities ?? []).slice(0, 4).map((priority) => ({
    detail: priority.reasons.join(' · '),
    id: `advice-${priority.signal.fingerprint}`,
    title: priority.signal.title,
    tone: statusTone(priority.signal.status),
  }));
}

/**
 * One row per scheduled workflow. The run history behind each signal is only
 * the five most recent runs, so this reports the current streak rather than
 * drawing a week-long chart the collector cannot fill.
 */
function WorkflowHealth(props: { operations: OperationsResponse | null }) {
  const rows = (props.operations?.signals ?? []).filter(
    (signal) => signal.source === 'github-actions',
  );
  if (rows.length === 0) {
    return (
      <EmptyState
        detail="GitHub 憑證未設定，或尚未讀到任何排程 workflow。"
        title="No workflow signal"
      />
    );
  }
  return (
    <div className="rel-workflows">
      {rows.map((signal) => (
        <div className="rel-workflow-row" key={signal.fingerprint}>
          <span className="rel-workflow-name">
            {text(signal, 'workflow') ?? signal.title}
          </span>
          <span className="rel-workflow-time">{lastRun(signal) ?? '—'}</span>
          <Pill tone={statusTone(signal.status)}>
            {text(signal, 'lastConclusion') ?? signal.status}
          </Pill>
          <span className="rel-workflow-streak">
            {streakLabel(number(signal, 'failureStreak'))}
          </span>
        </div>
      ))}
    </div>
  );
}

function CostOverview(props: {
  costHistory: CostHistoryResponse | null;
  podcastCosts: PodcastCostResponse | null;
  waste: { rate: number | null; wasteUsd: number | null };
}) {
  const daily = props.costHistory?.currentMonthDaily ?? [];
  const latest = daily.at(-1) ?? null;
  const anomalies = costAnomalies(daily);
  return (
    <div className="rel-cost">
      <div className="rel-cost-top">
        <Stat
          caption={latest ? `As of ${latest.date}` : 'No daily reading yet'}
          label="Accrued today"
          value={usd(latest?.accruedCostUsd ?? null)}
        />
        <Stat
          caption={
            props.waste.wasteUsd === null
              ? (props.podcastCosts?.message ?? 'No priced attempts yet')
              : `${usd(props.waste.wasteUsd)} sunk in failed attempts`
          }
          label="Retry waste"
          tone={
            props.waste.rate !== null && props.waste.rate > 0.15
              ? 'danger'
              : 'neutral'
          }
          value={props.waste.rate === null ? '—' : percent(props.waste.rate)}
        />
      </div>
      <div className="rel-cost-trend">
        <span className="cc-stat-label">Spend per day this month</span>
        <MiniBars
          ariaLabel="Spend per day this month"
          bars={dailySpend(daily)}
          tone="warning"
        />
      </div>
      <BarRows rows={providerRows(latest)} />
      {anomalies.length > 0 ? (
        <ul className="rel-anomalies">
          {anomalies.map((entry) => (
            <li key={entry.provider}>
              <TriangleAlert aria-hidden="true" />
              {entry.provider} 花費上升 {percent(entry.lift)}（前三日平均{' '}
              {usd(entry.baseline)} → 今日 {usd(entry.today)}）
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * `accruedCostUsd` is the month-to-date total, so charting it draws a nearly
 * flat line that says nothing. The day's own spend is the step between two
 * consecutive readings. The first day of the month has no predecessor, and a
 * gap in collection cannot be differenced either, so both are `null` rather
 * than a fabricated zero.
 */
function dailySpend(
  daily: CostHistoryResponse['currentMonthDaily'],
): { id: string; label: string; value: number | null }[] {
  return daily.map((point, index) => {
    const previous = index > 0 ? daily[index - 1]?.accruedCostUsd : undefined;
    const current = point.accruedCostUsd;
    const value =
      current === null || previous === null || previous === undefined
        ? null
        : Math.max(0, current - previous);
    return { id: point.date, label: point.date, value };
  });
}

function providerRows(
  latest: CostHistoryResponse['currentMonthDaily'][number] | null,
): BarRow[] {
  return (latest?.providers ?? []).map((entry) => ({
    id: entry.provider,
    label: entry.label,
    value: entry.accruedCostUsd === null ? '—' : usd(entry.accruedCostUsd),
    weight: entry.accruedCostUsd,
  }));
}

interface CostAnomaly {
  baseline: number;
  lift: number;
  provider: string;
  today: number;
}

/** Today against the mean of the three days before it, per provider. A provider
 * without a full baseline is skipped rather than compared against nothing. */
function costAnomalies(
  daily: CostHistoryResponse['currentMonthDaily'],
): CostAnomaly[] {
  const latest = daily.at(-1);
  if (!latest) {
    return [];
  }
  const window = daily.slice(-4, -1);
  if (window.length < 3) {
    return [];
  }
  const found: CostAnomaly[] = [];
  for (const entry of latest.providers) {
    if (entry.accruedCostUsd === null) {
      continue;
    }
    const priors = window
      .map((day) =>
        day.providers.find((row) => row.provider === entry.provider),
      )
      .map((row) => row?.accruedCostUsd ?? null)
      .filter((value): value is number => value !== null);
    if (priors.length < 3) {
      continue;
    }
    const baseline = priors.reduce((sum, value) => sum + value, 0) / 3;
    if (baseline <= 0) {
      continue;
    }
    const lift = (entry.accruedCostUsd - baseline) / baseline;
    if (lift > ANOMALY_THRESHOLD) {
      found.push({
        baseline,
        lift,
        provider: entry.label,
        today: entry.accruedCostUsd,
      });
    }
  }
  return found;
}

function flyFleet(operations: OperationsResponse | null) {
  const signals = (operations?.signals ?? []).filter(
    (signal) => signal.source === 'fly',
  );
  if (signals.length === 0) {
    return { caption: 'Fly credentials not configured', value: '—' };
  }
  const healthy = signals.filter(
    (signal) => signal.status === 'healthy',
  ).length;
  const running = signals.reduce(
    (sum, signal) => sum + (number(signal, 'startedMachines') ?? 0),
    0,
  );
  return {
    caption: `${integer(running)} machines running`,
    value: `${integer(healthy)} / ${integer(signals.length)}`,
  };
}

function number(signal: OperationalSignal, key: string): number | null {
  const value = signal.evidence[key];
  return typeof value === 'number' ? value : null;
}

function text(signal: OperationalSignal, key: string): string | null {
  const value = signal.evidence[key];
  return typeof value === 'string' ? value : null;
}

function lastRun(signal: OperationalSignal): string | null {
  const at = text(signal, 'lastRunAt');
  return at ? relativeTime(at) : null;
}

function streakLabel(streak: number | null): string {
  if (streak === null) {
    return '';
  }
  return streak > 0 ? `${integer(streak)} 連續失敗` : '';
}
