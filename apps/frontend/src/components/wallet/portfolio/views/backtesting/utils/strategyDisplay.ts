import {
  DMA_FGI_HIERARCHICAL_MINIMUM_STRATEGY_ID,
  DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID,
  ETH_BTC_ROTATION_DEFAULT_CONFIG_ID,
  ETH_BTC_ROTATION_STRATEGY_ID,
} from '../constants';

const STRATEGY_DISPLAY_NAMES: Record<string, string> = {
  [ETH_BTC_ROTATION_STRATEGY_ID]: 'ETH/BTC Rotation',
  [ETH_BTC_ROTATION_DEFAULT_CONFIG_ID]: 'ETH/BTC Rotation Default',
  [DMA_FGI_HIERARCHICAL_MINIMUM_STRATEGY_ID]: 'Hierarchical Minimum',
  [DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID]: 'Portfolio Rules',
};

const DEFAULT_COLOR = '#3b82f6';

const STRATEGY_PALETTE = [
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f97316', // Orange
  '#84cc16', // Lime
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#d946ef', // Fuchsia
  '#f43f5e', // Rose
  '#0ea5e9', // Sky
];

export function getStrategyDisplayName(strategyId: string): string {
  return STRATEGY_DISPLAY_NAMES[strategyId] ?? strategyId.replace(/_/g, ' ');
}

export function getStrategyColor(strategyId: string, index?: number): string {
  if (typeof index === 'number') {
    return STRATEGY_PALETTE[index % STRATEGY_PALETTE.length] ?? DEFAULT_COLOR;
  }

  // Fallback to hashing when no index provided
  let hash = 0;
  for (let i = 0; i < strategyId.length; i++) {
    hash = strategyId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (
    STRATEGY_PALETTE[Math.abs(hash) % STRATEGY_PALETTE.length] ?? DEFAULT_COLOR
  );
}
