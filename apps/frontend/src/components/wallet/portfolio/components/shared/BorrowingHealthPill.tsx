import { motion } from 'framer-motion';
import { type ReactNode, type RefObject, useEffect } from 'react';
import { createPortal } from 'react-dom';

import {
  mapBorrowingStatusToRiskLevel,
  RISK_DISPLAY_CONFIG,
  RiskLevel,
} from '@/constants/riskThresholds';
import { useBorrowingPositions } from '@/hooks/queries/analytics/useBorrowingPositions';
import type { BorrowingPositionsResponse, BorrowingSummary } from '@/services';

import { BorrowingPositionsTooltip } from './BorrowingPositionsTooltip';
import { useTooltipPosition } from './useTooltipPosition';
import { useTooltipState } from './useTooltipState';

interface BorrowingHealthPillProps {
  summary: BorrowingSummary;
  userId: string;
  size?: 'sm' | 'md';
}

const SIZE_CONFIGS = {
  sm: {
    container: 'px-2 py-1 text-xs gap-1.5',
    dot: 'w-2 h-2',
  },
  md: {
    container: 'px-3 py-1.5 text-sm gap-2',
    dot: 'w-2.5 h-2.5',
  },
} as const;

interface BorrowingSummaryWithHealth extends BorrowingSummary {
  overall_status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  worst_health_rate: number;
}

function useCloseOnOutsideClick(
  isExpanded: boolean,
  containerRef: RefObject<HTMLDivElement | null>,
  tooltipRef: RefObject<HTMLDivElement | null>,
  setIsExpanded: (isVisible: boolean) => void,
): void {
  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as Node;
      const isOutsideContainer =
        containerRef.current && !containerRef.current.contains(target);
      const isOutsideTooltip =
        tooltipRef.current && !tooltipRef.current.contains(target);

      if (isOutsideContainer && isOutsideTooltip) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [containerRef, isExpanded, setIsExpanded, tooltipRef]);
}

function hasBorrowingHealthData(
  summary: BorrowingSummary,
): summary is BorrowingSummaryWithHealth {
  return summary.overall_status !== null && summary.worst_health_rate !== null;
}

function buildExpandedTooltip(
  isExpanded: boolean,
  isMounted: boolean,
  tooltipRef: RefObject<HTMLDivElement | null>,
  tooltipPosition: { top: number; left: number },
  positionsData: BorrowingPositionsResponse | undefined,
  summary: BorrowingSummary,
  isLoading: boolean,
  error: Error | null,
  refetch: () => Promise<unknown>,
): ReactNode {
  if (!isExpanded || !isMounted) {
    return null;
  }

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50"
      style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
    >
      <BorrowingPositionsTooltip
        positions={positionsData?.positions || []}
        summary={summary}
        totalCollateralUsd={positionsData?.total_collateral_usd || 0}
        totalDebtUsd={positionsData?.total_debt_usd || 0}
        isLoading={isLoading}
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    </div>
  );
}

/**
 * Borrowing Health Pill
 *
 * A lightweight visual indicator for borrowing position health.
 * Displays color-coded status and health rate.
 *
 * Click to expand and view detailed borrowing positions with per-protocol breakdowns.
 */
export function BorrowingHealthPill({
  summary,
  userId,
  size = 'md',
}: BorrowingHealthPillProps): ReactNode {
  const {
    isVisible: isExpanded,
    setIsVisible: setIsExpanded,
    isMounted,
    containerRef,
    tooltipRef,
  } = useTooltipState();
  // Fetch positions on-demand when expanded
  const {
    data: positionsData,
    isLoading,
    error,
    refetch,
  } = useBorrowingPositions(userId, isExpanded);
  useCloseOnOutsideClick(isExpanded, containerRef, tooltipRef, setIsExpanded);

  const tooltipPosition = useTooltipPosition(
    isExpanded,
    containerRef,
    tooltipRef,
  );

  if (!hasBorrowingHealthData(summary)) {
    return null;
  }
  const { overall_status, worst_health_rate } = summary;

  const riskLevel = mapBorrowingStatusToRiskLevel(overall_status);
  const config = RISK_DISPLAY_CONFIG[riskLevel];
  const sizeConfig = SIZE_CONFIGS[size];

  // Only Pulse for Critical
  const shouldPulse = riskLevel === RiskLevel.CRITICAL;

  const expandedTooltip = buildExpandedTooltip(
    isExpanded,
    isMounted,
    tooltipRef,
    tooltipPosition,
    positionsData,
    summary,
    isLoading,
    error,
    refetch,
  );

  return (
    <>
      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        aria-label={`Borrowing health: ${worst_health_rate.toFixed(2)}. Click to view detailed positions.`}
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        className={`
          inline-flex items-center rounded-full cursor-pointer transition-all border
          ${sizeConfig.container}
          ${config.bg} ${config.border}
          hover:opacity-80
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500
        `}
      >
        <motion.div
          className={`rounded-full ${sizeConfig.dot} ${config.dot}`}
          animate={shouldPulse ? { opacity: [1, 0.5, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className={`font-medium ${config.text}`}>
          <span className="opacity-75 mr-1">Borrowing:</span>
          {worst_health_rate.toFixed(2)}
        </span>
      </div>
      {isMounted &&
        expandedTooltip &&
        createPortal(expandedTooltip, document.body)}
    </>
  );
}
