import type { WalletPortfolioDataWithDirection } from '@zapengine/app-core/adapters/walletPortfolioDataAdapter';
import { getRegimeFromStatus } from '@zapengine/app-core/lib/domain/regimeMapper';
import {
  EMPTY_INVEST_ALLOCATION,
  getRegimeAllocation,
  type Regime,
  regimes,
  type StrategyDirection,
} from '@zapengine/app-core/regime';
import type { RegimeAllocationBreakdown } from '@zapengine/app-core/types/domain/allocation';
import type {
  SectionState,
  SentimentData,
} from '@zapengine/app-core/types/portfolioProgressive';

export function findRegimeById(
  regimeId: string | null | undefined,
): Regime | undefined {
  if (!regimeId) {
    return undefined;
  }

  return regimes.find((regime) => regime.id === regimeId);
}

export function resolveEffectiveRegime(
  currentRegime: Regime | undefined,
  sentimentSection: SectionState<SentimentData> | undefined,
): Regime | undefined {
  if (currentRegime) {
    return currentRegime;
  }

  const derivedRegimeId = sentimentSection?.data
    ? getRegimeFromStatus(sentimentSection.data.status)
    : undefined;

  return findRegimeById(derivedRegimeId);
}

export function resolveDisplayRegime(
  selectedRegimeId: string | null,
  effectiveRegime: Regime | undefined,
): Regime | undefined {
  return findRegimeById(selectedRegimeId) ?? effectiveRegime;
}

export function determineActiveDirection(
  displayRegime: Regime | undefined,
  selectedDirection: StrategyDirection | null,
  isViewingCurrent: boolean,
  data: WalletPortfolioDataWithDirection,
): StrategyDirection {
  if (!displayRegime) {
    return 'default';
  }

  function hasStrategy(dir: StrategyDirection): boolean {
    return Boolean(
      displayRegime?.strategies?.[dir as keyof typeof displayRegime.strategies],
    );
  }

  if (selectedDirection && hasStrategy(selectedDirection)) {
    return selectedDirection;
  }

  if (
    isViewingCurrent &&
    'strategyDirection' in data &&
    data.strategyDirection !== 'default'
  ) {
    return data.strategyDirection as StrategyDirection;
  }

  if (hasStrategy('fromLeft')) {
    return 'fromLeft';
  }

  if (hasStrategy('fromRight')) {
    return 'fromRight';
  }

  return 'default';
}

export function resolveTargetAllocation(
  activeStrategy: Regime['strategies'][keyof Regime['strategies']] | undefined,
  displayRegime: Regime | undefined,
): RegimeAllocationBreakdown {
  const allocationAfter = activeStrategy?.useCase?.allocationAfter;
  if (allocationAfter) {
    return {
      spot: allocationAfter.spot,
      stable: allocationAfter.stable,
    };
  }

  if (displayRegime) {
    return getRegimeAllocation(displayRegime);
  }

  return EMPTY_INVEST_ALLOCATION;
}
