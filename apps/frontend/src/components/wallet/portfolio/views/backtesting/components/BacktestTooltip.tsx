import type { ReactNode } from 'react';

import {
  type BacktestTooltipProps,
  buildBacktestTooltipData,
  type DecisionSummary,
} from '../utils/backtestTooltipDataUtils';
import { BacktestAllocationBar } from './BacktestAllocationBar';

export type { BacktestTooltipProps };

function MetricRow({
  entry,
  keyPrefix,
  index,
}: {
  entry: { name: string; value: string | number; color: string };
  keyPrefix: string;
  index: number;
}) {
  return (
    <div
      key={`${keyPrefix}-${index}`}
      className="text-xs flex justify-between gap-4"
      style={{ color: entry.color }}
    >
      <span>{entry.name}</span>
      <span className="font-mono text-right">{entry.value}</span>
    </div>
  );
}

function DecisionRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 text-xs">
      <span className="text-gray-500">{label}</span>
      <div className="min-w-0 text-right text-gray-200">{children}</div>
    </div>
  );
}

function DecisionBlock({ decision }: { decision: DecisionSummary }) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
        Decision
      </div>
      <div className="text-xs font-medium text-gray-100">
        {decision.displayName}
      </div>
      <div className="space-y-1.5">
        <DecisionRow label="Rule">
          <span className="font-mono break-words">{decision.rule.label}</span>
          <span className="ml-1 text-[10px] uppercase text-gray-500">
            {decision.rule.group}
          </span>
        </DecisionRow>
        <DecisionRow label="Action">
          <span
            className="font-semibold"
            style={{ color: decision.action.color }}
          >
            {decision.action.label}
          </span>
        </DecisionRow>
        <DecisionRow label="Asset changes">
          <div className="space-y-1">
            {decision.assetChanges.length > 0 ? (
              decision.assetChanges.map((change, index) => (
                <div
                  key={`${change.label}-${index}`}
                  className="flex justify-end gap-3"
                  style={{ color: change.color }}
                >
                  <span className="min-w-0 break-words">{change.label}</span>
                  <span className="font-mono text-right">{change.value}</span>
                </div>
              ))
            ) : decision.assetChangeNote ? (
              <span style={{ color: decision.assetChangeNote.color }}>
                {decision.assetChangeNote.label}
              </span>
            ) : null}
          </div>
        </DecisionRow>
      </div>
    </div>
  );
}

/**
 * Custom Tooltip component that renders date label only once
 * and properly formats all chart data entries.
 * Shows which strategies triggered trading signals.
 */
export function BacktestTooltip(props: BacktestTooltipProps) {
  const { active } = props;
  const data = buildBacktestTooltipData(props);

  if (!active || !data) return null;

  const { dateStr, sections } = data;
  const { strategies, events, signals, decision, allocations } = sections;

  return (
    <div className="bg-[#111827] border border-[#374151] rounded-lg p-3 shadow-lg min-w-[260px] max-w-[360px]">
      <div className="text-xs font-medium text-white mb-2">{dateStr}</div>
      <div className="space-y-1">
        {strategies.map((entry, index) => (
          <div key={index} className="text-xs" style={{ color: entry.color }}>
            {entry.name}: ${entry.value.toLocaleString('en-US')}
          </div>
        ))}

        {events.map((entry, index) => {
          const strategiesStr =
            entry.strategies.length > 0
              ? ` (${entry.strategies.join(', ')})`
              : '';

          return (
            <div
              key={`evt-${index}`}
              className="text-xs font-medium"
              style={{ color: entry.color }}
            >
              {entry.name}
              {strategiesStr}
            </div>
          );
        })}
      </div>

      {signals.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-1">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">
            Signals
          </div>
          {signals.map((entry, index) => (
            <MetricRow
              key={`sig-${index}`}
              entry={entry}
              keyPrefix="sig"
              index={index}
            />
          ))}
        </div>
      )}

      {decision && <DecisionBlock decision={decision} />}

      {allocations.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
          {allocations.map((block) => (
            <BacktestAllocationBar
              key={block.id}
              displayName={block.displayName}
              allocation={block.allocation}
              strategyId={block.id}
              index={block.index}
            />
          ))}
        </div>
      )}
    </div>
  );
}
