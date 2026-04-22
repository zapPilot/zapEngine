import {
  type BacktestTooltipProps,
  buildBacktestTooltipData,
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
  const { strategies, events, signals, details, allocations } = sections;

  return (
    <div className="bg-[#111827] border border-[#374151] rounded-lg p-3 shadow-lg min-w-[200px]">
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

      {details.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-1">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">
            Decision
          </div>
          {details.map((entry, index) => (
            <MetricRow
              key={`detail-${index}`}
              entry={entry}
              keyPrefix="detail"
              index={index}
            />
          ))}
        </div>
      )}

      {allocations.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
          {allocations.map((block) => (
            <BacktestAllocationBar
              key={block.id}
              displayName={block.displayName}
              allocation={block.allocation}
              assetAllocation={block.assetAllocation}
              {...(block.spotAssetLabel
                ? { spotAssetLabel: block.spotAssetLabel }
                : {})}
              strategyId={block.id}
              index={block.index}
            />
          ))}
        </div>
      )}
    </div>
  );
}
