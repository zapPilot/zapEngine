import {
  DCA_CLASSIC_STRATEGY_ID,
  DMA_GATED_FGI_DEFAULT_CONFIG_ID,
  DMA_GATED_FGI_STRATEGY_ID,
} from '../constants';

const STRATEGY_DISPLAY_NAMES: Record<string, string> = {
  [DCA_CLASSIC_STRATEGY_ID]: 'DCA Classic',
  [DMA_GATED_FGI_STRATEGY_ID]: 'DMA Gated FGI',
  [DMA_GATED_FGI_DEFAULT_CONFIG_ID]: 'DMA Gated FGI Default',
};

const DCA_CLASSIC_COLOR = '#4b5563';
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
  if (
    strategyId === DCA_CLASSIC_STRATEGY_ID ||
    strategyId.includes(DCA_CLASSIC_STRATEGY_ID)
  ) {
    return DCA_CLASSIC_COLOR;
  }

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
