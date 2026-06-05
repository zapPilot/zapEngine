import type { ReactElement } from 'react';

import {
  mapBorrowingStatusToRiskLevel,
  RISK_DISPLAY_CONFIG,
} from '@/constants/riskThresholds';
import type { BorrowingPosition, BorrowingSummary } from '@/services';

import { FinancialMetricRow } from './FinancialMetricRow';
import { IconBadge } from './IconBadge';
import { TokenIconStack } from './TokenIconStack';

interface BorrowingPositionsTooltipProps {
  /** Borrowing positions data */
  positions: BorrowingPosition[];
  /** Summary data for overall status */
  summary: BorrowingSummary;
  /** Total collateral across all positions in USD */
  totalCollateralUsd: number;
  /** Total debt across all positions in USD */
  totalDebtUsd: number;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Retry handler for failed requests */
  onRetry?: (() => void) | undefined;
}

interface TooltipErrorProps {
  error: Error;
  onRetry?: (() => void) | undefined;
}

interface PositionCardProps {
  position: BorrowingPosition;
}

interface TooltipStateWrapperProps {
  children: React.ReactNode;
}

type RiskColorConfig =
  (typeof RISK_DISPLAY_CONFIG)[keyof typeof RISK_DISPLAY_CONFIG];

interface RiskBadgeProps {
  config: Pick<RiskColorConfig, 'bg' | 'text' | 'border'>;
  children: React.ReactNode;
}

/** Shared panel chrome for every tooltip state (loading, error, empty, content) */
const PANEL_CLASS =
  'w-96 bg-gray-900/95 backdrop-blur-sm border border-gray-800 rounded-lg shadow-xl p-4';

/** Pill badge rendered with risk-level colors (per-position rate + overall status) */
function RiskBadge({ config, children }: RiskBadgeProps): ReactElement {
  return (
    <span
      className={`
        px-2 py-0.5 rounded text-xs font-medium
        ${config.bg} ${config.text} ${config.border} border
      `}
    >
      {children}
    </span>
  );
}

interface TokenRowProps {
  label: string;
  tokens: { symbol: string }[];
}

/** Labeled row of token icons (collateral / debt breakdown in a position card) */
function TokenRow({ label, tokens }: TokenRowProps): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 min-w-[60px]">{label}:</span>
      <TokenIconStack tokens={tokens} maxVisible={3} />
    </div>
  );
}

/**
 * Common wrapper for tooltips in various states (loading, error, empty)
 */
function TooltipStateWrapper({
  children,
}: TooltipStateWrapperProps): ReactElement {
  return <div className={PANEL_CLASS}>{children}</div>;
}

/**
 * Loading Skeleton Component
 */
function TooltipSkeleton(): ReactElement {
  return (
    <div className={`${PANEL_CLASS} animate-pulse`}>
      <div className="h-4 bg-gray-700 rounded w-3/4 mb-3" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-800 rounded" />
        ))}
      </div>
    </div>
  );
}

/**
 * Error State Component
 */
function TooltipError({ error, onRetry }: TooltipErrorProps): ReactElement {
  return (
    <TooltipStateWrapper>
      <div className="text-center py-4">
        <p className="text-sm text-rose-400 mb-2">Failed to load positions</p>
        <p className="text-xs text-gray-400 mb-3">{error.message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            Try Again
          </button>
        )}
      </div>
    </TooltipStateWrapper>
  );
}

/**
 * Empty State Component
 */
function TooltipEmpty(): ReactElement {
  return (
    <TooltipStateWrapper>
      <div className="text-center py-4">
        <p className="text-sm text-gray-400">No borrowing positions found</p>
        <p className="text-xs text-gray-500 mt-1">
          You don&apos;t have any active debt positions
        </p>
      </div>
    </TooltipStateWrapper>
  );
}

/**
 * Position Card Component
 */
function PositionCard({ position }: PositionCardProps): ReactElement {
  const riskLevel = mapBorrowingStatusToRiskLevel(position.health_status);
  const riskConfig = RISK_DISPLAY_CONFIG[riskLevel];

  return (
    <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
      {/* Protocol Header with Icon */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconBadge
            src={`https://zap-assets-worker.davidtnfsh.workers.dev/projectPictures/${position.protocol_id.toLowerCase()}.webp`}
            alt={`${position.protocol_name} logo`}
            size="md" // 24px
            fallback={{ type: 'letter', content: position.protocol_name }}
          />
          <div>
            <p className="text-sm font-medium text-white">
              {position.protocol_name}
            </p>
            <p className="text-xs text-gray-400 capitalize">{position.chain}</p>
          </div>
        </div>
        <RiskBadge config={riskConfig}>
          {position.health_rate.toFixed(2)}
        </RiskBadge>
      </div>

      {/* Financial Details */}
      <div className="space-y-1">
        <FinancialMetricRow
          label="Collateral"
          value={`$${position.collateral_usd.toLocaleString()}`}
        />
        <FinancialMetricRow
          label="Debt"
          value={`$${position.debt_usd.toLocaleString()}`}
        />
        <FinancialMetricRow
          label="Net Value"
          value={`$${position.net_value_usd.toLocaleString()}`}
          valueClassName={`font-medium ${
            position.net_value_usd >= 0 ? 'text-green-400' : 'text-rose-400'
          }`}
        />
      </div>

      {/* Token Lists with Icons */}
      {(position.collateral_tokens.length > 0 ||
        position.debt_tokens.length > 0) && (
        <div className="pt-2 border-t border-gray-700 space-y-2">
          {position.collateral_tokens.length > 0 && (
            <TokenRow label="Collateral" tokens={position.collateral_tokens} />
          )}
          {position.debt_tokens.length > 0 && (
            <TokenRow label="Debt" tokens={position.debt_tokens} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Borrowing Positions Tooltip Component
 *
 * Displays detailed borrowing positions in an expanded tooltip.
 * Shows per-position health rates, collateral, debt, and token breakdowns.
 *
 * Content Structure:
 * 1. Header: Overall status badge
 * 2. Loading/Error/Empty States
 * 3. Position Cards: Per-position breakdown
 * 4. Footer: Total collateral/debt summary
 *
 * @example
 * ```tsx
 * <BorrowingPositionsTooltip
 *   positions={data.positions}
 *   summary={borrowingSummary}
 *   isLoading={isLoading}
 *   error={error}
 *   onRetry={refetch}
 * />
 * ```
 */
export function BorrowingPositionsTooltip({
  positions,
  summary,
  totalCollateralUsd,
  totalDebtUsd,
  isLoading,
  error,
  onRetry,
}: BorrowingPositionsTooltipProps): ReactElement {
  // Loading state
  if (isLoading) {
    return <TooltipSkeleton />;
  }

  // Error state
  if (error) {
    return <TooltipError error={error} onRetry={onRetry} />;
  }

  // Empty state - also handle null status (no debt positions)
  if (
    !positions ||
    positions.length === 0 ||
    summary.overall_status === null ||
    summary.worst_health_rate === null
  ) {
    return <TooltipEmpty />;
  }

  const riskLevel = mapBorrowingStatusToRiskLevel(summary.overall_status);
  const riskConfig = RISK_DISPLAY_CONFIG[riskLevel];

  return (
    <div className={`${PANEL_CLASS} pointer-events-auto`} role="tooltip">
      {/* Header with Overall Status */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200">
          Borrowing Positions
        </h3>
        <RiskBadge config={riskConfig}>
          {riskConfig.emoji} {riskConfig.label}
        </RiskBadge>
      </div>

      {/* Position Cards */}
      <div className="space-y-2 mb-3 max-h-64 overflow-y-auto custom-scrollbar">
        {positions.map((position) => (
          <PositionCard
            key={`${position.protocol_id}-${position.chain}`}
            position={position}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="my-3 border-t border-gray-800" />

      {/* Financial Summary Footer */}
      <div className="space-y-1">
        {[
          {
            label: 'Total Collateral',
            value: `$${totalCollateralUsd.toLocaleString()}`,
          },
          { label: 'Total Debt', value: `$${totalDebtUsd.toLocaleString()}` },
          {
            label: 'Worst Health Rate',
            value: summary.worst_health_rate.toFixed(2),
            valueClassName: `font-medium ${riskConfig.text}`,
          },
        ].map((metric) => (
          <FinancialMetricRow key={metric.label} {...metric} />
        ))}
      </div>
    </div>
  );
}
