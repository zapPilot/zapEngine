import type { WalletPortfolioDataWithDirection } from "@/adapters/walletPortfolioDataAdapter";
import { EMPTY_INVEST_ALLOCATION } from "@/components/wallet/regime/investAllocation";
import {
  getRegimeAllocation,
  type Regime,
  regimes,
} from "@/components/wallet/regime/regimeData";
import { type StrategyDirection } from "@/components/wallet/regime/strategyLabels";
import { getRegimeFromStatus } from "@/lib/domain/regimeMapper";
import type { RegimeAllocationBreakdown } from "@/types/domain/allocation";
import type {
  SectionState,
  SentimentData,
} from "@/types/portfolio-progressive";

export function findRegimeById(
  regimeId: string | null | undefined
): Regime | undefined {
  if (!regimeId) {
    return undefined;
  }

  return regimes.find(regime => regime.id === regimeId);
}

export function resolveEffectiveRegime(
  currentRegime: Regime | undefined,
  sentimentSection: SectionState<SentimentData> | undefined
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
  effectiveRegime: Regime | undefined
): Regime | undefined {
  return findRegimeById(selectedRegimeId) ?? effectiveRegime;
}

export function determineActiveDirection(
  displayRegime: Regime | undefined,
  selectedDirection: StrategyDirection | null,
  isViewingCurrent: boolean,
  data: WalletPortfolioDataWithDirection
): StrategyDirection {
  if (!displayRegime) {
    return "default";
  }

  function hasStrategy(dir: StrategyDirection): boolean {
    return Boolean(
      displayRegime?.strategies?.[dir as keyof typeof displayRegime.strategies]
    );
  }

  if (selectedDirection && hasStrategy(selectedDirection)) {
    return selectedDirection;
  }

  if (
    isViewingCurrent &&
    "strategyDirection" in data &&
    data.strategyDirection !== "default"
  ) {
    return data.strategyDirection as StrategyDirection;
  }

  if (hasStrategy("fromLeft")) {
    return "fromLeft";
  }

  if (hasStrategy("fromRight")) {
    return "fromRight";
  }

  return "default";
}

export function resolveTargetAllocation(
  activeStrategy: Regime["strategies"][keyof Regime["strategies"]] | undefined,
  displayRegime: Regime | undefined
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
