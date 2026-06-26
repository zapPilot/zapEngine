import type { PortfolioRuleMetadata as ApiPortfolioRuleMetadata } from '@zapengine/app-core/types/strategy';
import { useMemo } from 'react';

import { useStrategyConfigs } from '@/components/wallet/portfolio/views/invest/trading/hooks/useStrategyConfigs';

export interface PortfolioRuleMetadata {
  defaultEnabled: boolean;
  description: string;
  name: string;
  priority: number;
}

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
    return apiRules ? sortByPriority(apiRules.map(mapApiRule)) : [];
  }, [data?.portfolio_rules]);

  return {
    isError,
    isLoading,
    rules,
  };
}
