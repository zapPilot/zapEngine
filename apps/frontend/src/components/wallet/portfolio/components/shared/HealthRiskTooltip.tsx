import { RISK_DISPLAY_CONFIG, RiskLevel } from "@/constants/riskThresholds";
import type { RiskMetrics } from "@/services";

import { FinancialMetricRow } from "./FinancialMetricRow";

interface HealthRiskTooltipProps {
  /** Risk metrics from the analytics service */
  riskMetrics: RiskMetrics;
  /** Calculated risk level */
  riskLevel: RiskLevel;
  /** Whether the user is viewing their own bundle */
  isOwnBundle: boolean;
  /** Optional handler for viewing detailed risk breakdown */
  onViewDetails?: (() => void) | undefined;
}

/**
 * Health Risk Tooltip Component
 *
 * Displays comprehensive risk breakdown in a portal-based tooltip.
 * Shows health factor details, financial metrics, and risk context.
 *
 * Content Structure:
 * 1. Header: Current status with risk level badge
 * 2. Critical Insight: Buffer distance from liquidation + multi-position note
 * 3. Financial Breakdown: Collateral, debt, threshold (portfolio-level totals)
 * 4. Attribution: Protocol source + position count
 * 5. Action: Optional "View Details" link
 *
 * @example
 * ```tsx
 * <HealthRiskTooltip
 *   riskMetrics={data.risk_metrics}
 *   riskLevel={RiskLevel.MODERATE}
 *   isOwnBundle={true}
 * />
 * ```
 */
export function HealthRiskTooltip({
  riskMetrics,
  riskLevel,
  isOwnBundle,
  onViewDetails,
}: HealthRiskTooltipProps) {
  const {
    health_rate,
    leverage_ratio,
    collateral_value_usd,
    debt_value_usd,
    liquidation_threshold,
    protocol_source,
    position_count,
  } = riskMetrics;

  const riskConfig = RISK_DISPLAY_CONFIG[riskLevel];
  const riskLabel = riskConfig.label;

  // Calculate buffer from liquidation threshold
  const buffer = health_rate - liquidation_threshold;
  const bufferPercent = ((buffer / liquidation_threshold) * 100).toFixed(1);

  // Risk message based on level
  const getRiskMessage = (): string => {
    switch (riskLevel) {
      case RiskLevel.SAFE:
        return `You have a ${bufferPercent}% safety buffer above the liquidation threshold.`;
      case RiskLevel.MODERATE:
        return `Comfortable buffer, but monitor price movements closely.`;
      case RiskLevel.RISKY:
        return `Low safety buffer. Consider adding collateral to reduce risk.`;
      case RiskLevel.CRITICAL:
        return isOwnBundle
          ? "Liquidation risk high. Add collateral or repay debt immediately."
          : "This position is at high risk of liquidation.";
      default:
        return "Monitor your position health regularly.";
    }
  };

  return (
    <div
      className="
        w-80 bg-gray-900/95 backdrop-blur-sm border border-gray-800
        rounded-lg shadow-xl p-4 pointer-events-auto
      "
      role="tooltip"
    >
      {/* Header with Status Badge */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200">Position Health</h3>
        <span
          className={`
            px-2 py-0.5 rounded text-xs font-medium
            ${riskConfig.bg} ${riskConfig.text} ${riskConfig.border} border
          `}
        >
          {riskConfig.emoji} {riskLabel}
        </span>
      </div>

      {/* Multi-Position Note (if applicable) */}
      {position_count > 1 && (
        <div className="mb-3 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-400">
          <span className="font-medium">Showing your riskiest position</span>
          <br />
          This health factor represents your most vulnerable exposure.
        </div>
      )}

      {/* Critical Insight - Buffer Information */}
      <div className="mb-3 space-y-1">
        <div className="text-xs text-gray-400">Liquidation Buffer</div>
        <div className="text-sm font-medium text-white">
          {buffer >= 0 ? "+" : ""}
          {buffer.toFixed(2)} above threshold (
          {liquidation_threshold.toFixed(2)})
        </div>
        <div className={`text-xs ${riskConfig.text}`}>{getRiskMessage()}</div>
      </div>

      {/* Divider */}
      <div className="my-3 border-t border-gray-800" />

      {/* Financial Breakdown */}
      <div className="space-y-2 mb-3">
        <FinancialMetricRow
          label="Total Collateral"
          value={`$${collateral_value_usd.toLocaleString()}`}
        />
        <FinancialMetricRow
          label="Total Debt"
          value={`$${debt_value_usd.toLocaleString()}`}
        />
        {/* Leverage ratio is unique to health risk breakdown */}
        <FinancialMetricRow
          label="Leverage Ratio"
          value={`${leverage_ratio.toFixed(2)}x`}
        />
      </div>

      {/* Divider */}
      <div className="my-3 border-t border-gray-800" />

      {/* Attribution */}
      <div className="text-xs text-gray-400 mb-3">
        {position_count === 1 ? (
          <>Via {protocol_source}</>
        ) : (
          <>
            {position_count} positions
            {protocol_source && <> (including {protocol_source})</>}
          </>
        )}
      </div>

      {/* Action Button (if handler provided) */}
      {onViewDetails && isOwnBundle && (
        <button
          onClick={e => {
            e.stopPropagation();
            onViewDetails();
          }}
          className="
            w-full px-3 py-1.5 text-xs font-medium
            bg-gray-800 hover:bg-gray-700
            text-white rounded
            transition-colors duration-200
          "
        >
          View Detailed Breakdown →
        </button>
      )}

      {/* Visitor Mode Note */}
      {!isOwnBundle && (
        <div className="mt-2 text-xs text-gray-500 italic">
          Switch to your bundle to manage positions
        </div>
      )}
    </div>
  );
}
