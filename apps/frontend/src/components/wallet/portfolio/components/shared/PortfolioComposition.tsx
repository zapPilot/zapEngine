import { Zap } from 'lucide-react';
import type { ReactElement } from 'react';

import { type WalletPortfolioDataWithDirection } from '@/adapters/walletPortfolioDataAdapter';
import { GradientButton } from '@/components/ui';
import { toInvestCompositionTarget } from '@/components/wallet/regime/investAllocation';
import {
  getRegimeAllocation,
  type Regime,
} from '@/components/wallet/regime/regimeData';
import { UNIFIED_COLORS } from '@/constants/assets';
import { GRADIENTS } from '@/constants/design-system';

import { PortfolioCompositionSkeleton } from '../../views/DashboardSkeleton';
import {
  mapLegacyConstituentsToUnified,
  UnifiedAllocationBar,
  type UnifiedSegment,
} from '../allocation';
import {
  buildRealCryptoAssets,
  buildTargetCryptoAssets,
} from '../utils/portfolioCompositionHelpers';

interface CompositionTarget {
  crypto: number;
  stable: number;
}

interface PortfolioCompositionProps {
  data: WalletPortfolioDataWithDirection;
  currentRegime: Regime | undefined;
  /** Optional target allocation to render without regime */
  targetAllocation?: CompositionTarget | undefined;
  isEmptyState?: boolean;
  /** Whether user is viewing their own bundle (enables wallet actions) */
  isOwnBundle?: boolean;
  isLoading?: boolean;
  onRebalance: () => void;
}

const STYLES = {
  container:
    'bg-gray-900/20 border border-gray-800 rounded-2xl p-8 flex flex-col relative overflow-hidden',
  header: 'flex justify-between items-end mb-8',
  title: 'text-xl font-bold text-white mb-1',
  subtitle: 'text-sm text-gray-400',
  allocationRow: 'flex gap-2 items-center',
  barTrack:
    'relative w-full bg-gray-900/50 rounded-xl border border-gray-800 p-3 flex flex-col gap-3 overflow-hidden',
} as const;

/**
 * Builds unified target segments from crypto/stable percentages.
 * The entire crypto portion maps to BTC (the sole spot crypto asset).
 */
function buildTargetUnifiedSegments(
  target: CompositionTarget,
): UnifiedSegment[] {
  const segments: UnifiedSegment[] = [];

  if (target.crypto > 0) {
    segments.push({
      category: 'btc',
      label: 'BTC',
      percentage: target.crypto,
      color: UNIFIED_COLORS.BTC,
    });
  }

  if (target.stable > 0) {
    segments.push({
      category: 'stable',
      label: 'STABLE',
      percentage: target.stable,
      color: UNIFIED_COLORS.STABLE,
    });
  }

  return segments.sort((a, b) => b.percentage - a.percentage);
}

function resolveTargetAllocation(
  targetAllocation: CompositionTarget | undefined,
  currentRegime: Regime | undefined,
): CompositionTarget | undefined {
  if (targetAllocation) {
    return targetAllocation;
  }

  if (!currentRegime) {
    return undefined;
  }

  const breakdown = getRegimeAllocation(currentRegime);
  return toInvestCompositionTarget(breakdown);
}

function resolveCurrentSegments(
  data: WalletPortfolioDataWithDirection,
  isEmptyState: boolean,
  currentRegime: Regime | undefined,
  target: CompositionTarget,
): UnifiedSegment[] {
  const cryptoAssets =
    isEmptyState && currentRegime
      ? buildTargetCryptoAssets(currentRegime)
      : buildRealCryptoAssets(data);

  const stablePercentage = isEmptyState
    ? target.stable
    : data.currentAllocation.stable;

  return mapLegacyConstituentsToUnified(cryptoAssets, stablePercentage);
}

function getDriftClassName(delta: number): string {
  return delta > 5 ? 'text-orange-400' : 'text-gray-500';
}

export function PortfolioComposition({
  data,
  currentRegime,
  targetAllocation,
  isEmptyState = false,
  isOwnBundle = true,
  isLoading = false,
  onRebalance,
}: PortfolioCompositionProps): ReactElement | null {
  const isActionsDisabled = isEmptyState || !isOwnBundle;
  const target = resolveTargetAllocation(targetAllocation, currentRegime);

  if (isLoading) {
    return <PortfolioCompositionSkeleton />;
  }

  if (!target) {
    return null;
  }

  const targetSegments = buildTargetUnifiedSegments(target);
  const currentSegments = resolveCurrentSegments(
    data,
    isEmptyState,
    currentRegime,
    target,
  );

  return (
    <div className={STYLES.container} data-testid="composition-bar">
      <div className={STYLES.header}>
        <div>
          <h2 className={STYLES.title}>Portfolio Composition</h2>
          <div className={STYLES.subtitle}>
            <div className={STYLES.allocationRow}>
              {/* Drift Indicator moved here for context */}
              <span
                className={`text-xs font-bold ${getDriftClassName(data.delta)}`}
              >
                Drift: {data.delta.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <GradientButton
            data-testid="rebalance-button"
            gradient={GRADIENTS.PRIMARY}
            icon={Zap}
            className="h-8 text-xs"
            onClick={onRebalance}
            disabled={isActionsDisabled}
          >
            Rebalance
          </GradientButton>
        </div>
      </div>

      {/* ALLOCATION BAR TRACK */}
      <div className={STYLES.barTrack}>
        {/* Target Indicator Bar - Thin indicator with unified categories */}
        <UnifiedAllocationBar
          segments={targetSegments}
          size="sm"
          showLabels={false}
          title="Target Allocation"
          testIdPrefix="target"
        />

        {/* Current Portfolio - Standard size with full labels */}
        <UnifiedAllocationBar
          segments={currentSegments}
          size="md"
          title="Current Portfolio"
          testIdPrefix="current"
        />
      </div>
    </div>
  );
}
