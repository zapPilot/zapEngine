import type {
  BacktestAssetAllocation,
  BacktestStrategyPoint,
  BacktestTimelinePoint,
} from '@/types/backtesting';

export interface TooltipItem {
  name: string;
  value: number;
  color: string;
}

export interface EventItem {
  name: string;
  strategies: string[];
  color: string;
}

export interface AllocationBlock {
  id: string;
  displayName: string;
  allocation: BacktestAssetAllocation;
  index: number | undefined;
}

export interface DecisionRuleItem {
  label: string;
  group: string;
}

export interface DecisionActionItem {
  label: string;
  color: string;
}

export interface DecisionAssetChangeItem {
  label: string;
  value: string;
  color: string;
}

export interface DecisionAssetChangeNote {
  label: string;
  color: string;
}

export interface DecisionSummary {
  strategyId: string;
  displayName: string;
  rule: DecisionRuleItem;
  action: DecisionActionItem;
  assetChanges: DecisionAssetChangeItem[];
  assetChangeNote: DecisionAssetChangeNote | null;
}

export interface ParsedTooltipData {
  dateStr: string;
  sections: {
    strategies: TooltipItem[];
    events: EventItem[];
    decision: DecisionSummary | null;
    allocations: AllocationBlock[];
  };
}

export interface BacktestTooltipPayloadEntry {
  name?: string | number;
  value?: string | number | readonly (string | number)[];
  color?: string;
  payload?: Record<string, unknown>;
}

export type StrategiesRecord = Record<string, BacktestStrategyPoint>;
export type EventStrategiesRecord = Record<string, string[]>;

export interface TooltipSections {
  strategies: TooltipItem[];
  events: EventItem[];
  decision: DecisionSummary | null;
}

export interface ParsedTooltipSource {
  payload: BacktestTooltipPayloadEntry[];
  label: string | number | undefined;
  sortedStrategyIds: string[] | undefined;
  chartDataIndex?: Map<string, BacktestTimelinePoint> | undefined;
}

export interface BacktestTooltipProps {
  active?: boolean;
  payload?: BacktestTooltipPayloadEntry[];
  label?: string | number;
  sortedStrategyIds?: string[];
  chartDataIndex?: Map<string, BacktestTimelinePoint> | undefined;
}
