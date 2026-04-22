import { AlertCircle } from 'lucide-react';

import { getRiskLevel, RiskLevel } from '@/constants/riskThresholds';
import type { RiskMetrics } from '@/services';

interface HealthWarningBannerProps {
  /** Risk metrics from the analytics service */
  riskMetrics: RiskMetrics;
  /** Optional handler for viewing detailed risk breakdown */
  onViewDetails?: (() => void) | undefined;
}

/**
 * Health Warning Banner Component
 *
 * Displays a persistent warning banner on mobile devices when the health
 * factor is in a dangerous state (< 1.3). Provides immediate visibility
 * for critical risk situations on smaller screens.
 *
 * Features:
 * - Mobile-only (hidden on tablet/desktop)
 * - Shows for RISKY and CRITICAL states only
 * - Includes CTA button for detailed view (if handler provided)
 * - Red background with icon for high visibility
 *
 * @example
 * ```tsx
 * <HealthWarningBanner
 *   riskMetrics={data.risk_metrics}
 *   onViewDetails={() => openRiskModal()}
 * />
 * ```
 */
export function HealthWarningBanner({
  riskMetrics,
  onViewDetails,
}: HealthWarningBannerProps) {
  const { health_rate } = riskMetrics;
  const riskLevel = getRiskLevel(health_rate);

  // Only show for dangerous states (CSS `sm:hidden` handles mobile-only visibility)
  const shouldShow =
    riskLevel === RiskLevel.RISKY || riskLevel === RiskLevel.CRITICAL;

  if (!shouldShow) {
    return null;
  }

  return (
    <div
      className="
        sm:hidden mb-4 p-3 rounded-lg
        bg-rose-500/10 border border-rose-500/30
        flex items-start gap-3
      "
      role="alert"
      aria-live="assertive"
    >
      {/* Icon */}
      <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-rose-400 mb-1">
          Liquidation Risk
        </h4>
        <p className="text-xs text-rose-300 mb-2">
          Health factor at {health_rate.toFixed(2)}. Your riskiest position
          needs attention.
        </p>

        {/* CTA Button (if handler provided) */}
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="
              inline-flex items-center gap-1.5
              px-3 py-1.5 text-xs font-medium
              bg-rose-500 hover:bg-rose-600
              text-white rounded
              transition-colors duration-200
            "
          >
            View Details
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </div>
  );
}
