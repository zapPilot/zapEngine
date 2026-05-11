import { useMemo } from 'react';

import { useStrategyConfigs } from '@/components/wallet/portfolio/views/invest/trading/hooks/useStrategyConfigs';
import type { PortfolioRuleMetadata as ApiPortfolioRuleMetadata } from '@/types/strategy';

export interface PortfolioRuleMetadata {
  defaultEnabled: boolean;
  description: string;
  name: string;
  priority: number;
}

const FALLBACK_PORTFOLIO_RULES: PortfolioRuleMetadata[] = [
  {
    name: 'cross_down_exit',
    priority: 10,
    description:
      'Exit any asset that crosses below DMA; proceeds remain stable.',
    defaultEnabled: true,
  },
  {
    name: 'cross_up_equal_weight',
    priority: 20,
    description:
      'Equal-weight all currently above-DMA risk assets on a cross-up.',
    defaultEnabled: true,
  },
  {
    name: 'eth_btc_ratio_rotation',
    priority: 21,
    description:
      'Rotate BTC <-> ETH when ETH/BTC ratio crosses its 200-day DMA.',
    defaultEnabled: true,
  },
  {
    name: 'eth_btc_deviation_dca',
    priority: 22,
    description: 'DCA rotate BTC and ETH when ETH/BTC deviates from its DMA.',
    defaultEnabled: true,
  },
  {
    name: 'greed_sell_suppression',
    priority: 23,
    description:
      'Suppress greed sells when recent cross-up momentum is still active.',
    defaultEnabled: true,
  },
  {
    name: 'dma_stable_gating',
    priority: 24,
    description:
      'Keep stable capital gated until risk assets reclaim DMA support.',
    defaultEnabled: true,
  },
  {
    name: 'spy_latch',
    priority: 25,
    description: 'Latch SPY exposure while SPY remains above its DMA trend.',
    defaultEnabled: true,
  },
  {
    name: 'dma_overextension_dca_sell',
    priority: 30,
    description:
      'DCA sell assets that are above DMA and beyond asset-specific extension thresholds.',
    defaultEnabled: true,
  },
  {
    name: 'extreme_fear_dca_buy',
    priority: 40,
    description: 'DCA buy assets when their relevant FGI is extreme fear.',
    defaultEnabled: true,
  },
  {
    name: 'fgi_downshift_dca_sell',
    priority: 50,
    description: 'DCA sell assets when relevant FGI transitions out of greed.',
    defaultEnabled: true,
  },
];

function mapApiRule(rule: ApiPortfolioRuleMetadata): PortfolioRuleMetadata {
  return {
    name: rule.name,
    priority: rule.priority,
    description: rule.description,
    defaultEnabled: rule.default_enabled,
  };
}

function sortByPriority(
  rules: PortfolioRuleMetadata[],
): PortfolioRuleMetadata[] {
  return [...rules].sort((left, right) => left.priority - right.priority);
}

export function usePortfolioRules(): {
  isError: boolean;
  isLoading: boolean;
  rules: PortfolioRuleMetadata[];
} {
  const { data, isError, isLoading } = useStrategyConfigs();

  const rules = useMemo(() => {
    const apiRules = data?.portfolio_rules;
    if (apiRules && apiRules.length > 0) {
      return sortByPriority(apiRules.map(mapApiRule));
    }
    return FALLBACK_PORTFOLIO_RULES;
  }, [data?.portfolio_rules]);

  return {
    isError,
    isLoading,
    rules,
  };
}
