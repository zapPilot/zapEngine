import { toInvestCompositionTarget } from "@/components/wallet/regime/investAllocation";
import {
  getRegimeAllocation,
  type RegimeId,
  regimes,
} from "@/components/wallet/regime/regimeData";
import { getActiveStrategy } from "@/lib/domain/strategySelector";
import type {
  DirectionType,
  DurationInfo,
} from "@/schemas/api/regimeHistorySchemas";
import type { RegimeHistoryData } from "@/services";

export interface TargetAllocation {
  crypto: number;
  stable: number;
}

function createFallbackTargetAllocation(): TargetAllocation {
  return { crypto: 50, stable: 50 };
}

/**
 * Gets target allocation for a regime
 */
export function getTargetAllocation(regimeId: RegimeId): TargetAllocation {
  const regime = regimes.find(r => r.id === regimeId);

  if (!regime) {
    return createFallbackTargetAllocation();
  }

  const allocation = getRegimeAllocation(regime);
  return toInvestCompositionTarget(allocation);
}

export interface RegimeStrategyInfo {
  previousRegime: RegimeId | null;
  strategyDirection: DirectionType;
  regimeDuration: DurationInfo;
}

/**
 * Derives strategy information from regime history
 */
export function getRegimeStrategyInfo(
  regimeHistoryData: RegimeHistoryData | null
): RegimeStrategyInfo {
  if (!regimeHistoryData) {
    return {
      previousRegime: null,
      strategyDirection: "default",
      regimeDuration: null,
    };
  }

  return {
    previousRegime: regimeHistoryData.previousRegime,
    strategyDirection: getActiveStrategy(
      regimeHistoryData.direction,
      regimeHistoryData.currentRegime,
      regimeHistoryData.previousRegime
    ),
    regimeDuration: regimeHistoryData.duration,
  };
}
