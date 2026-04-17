import type {
  BacktestAssetAllocation,
  BacktestPortfolioAllocation,
  BacktestSpotAssetSymbol,
  BacktestStrategyPoint,
} from "@/types/backtesting";

import type { IndicatorKey } from "../components/backtestChartLegendData";

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

export interface SignalItem {
  name: string;
  value: string | number;
  color: string;
}

export interface AllocationBlock {
  id: string;
  displayName: string;
  allocation: BacktestPortfolioAllocation;
  assetAllocation: BacktestAssetAllocation;
  index: number | undefined;
  spotAssetLabel?: BacktestSpotAssetSymbol;
}

export interface DetailItem {
  name: string;
  value: string;
  color: string;
}

export interface ParsedTooltipData {
  dateStr: string;
  sections: {
    strategies: TooltipItem[];
    events: EventItem[];
    signals: SignalItem[];
    details: DetailItem[];
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
  signals: SignalItem[];
  details: DetailItem[];
}

export interface ParsedTooltipSource {
  payload: BacktestTooltipPayloadEntry[];
  label: string | number | undefined;
  sortedStrategyIds: string[] | undefined;
}

export interface BacktestTooltipProps {
  active?: boolean;
  payload?: BacktestTooltipPayloadEntry[];
  label?: string | number;
  sortedStrategyIds?: string[];
  activeIndicators?: Set<IndicatorKey>;
}
