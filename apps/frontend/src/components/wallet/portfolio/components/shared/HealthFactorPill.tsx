import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';

import { getRiskConfig, RiskLevel } from '@/constants/riskThresholds';
import type { RiskMetrics } from '@/services';

import { HealthRiskTooltip } from './HealthRiskTooltip';
import { useTooltipPosition } from './useTooltipPosition';
import { useTooltipState } from './useTooltipState';

/**
 * Size configurations for the Health Factor Pill
 */
const SIZE_CONFIGS = {
  sm: {
    container: 'px-2 py-1 text-xs gap-1.5',
    dot: 'w-2 h-2',
    label: 'hidden sm:inline',
  },
  md: {
    container: 'px-3 py-1.5 text-sm gap-2',
    dot: 'w-2.5 h-2.5',
    label: 'inline',
  },
  lg: {
    container: 'px-3 py-2 text-base gap-2',
    dot: 'w-3 h-3',
    label: 'inline',
  },
} as const;

interface HealthFactorPillProps {
  /** Risk metrics from the analytics service */
  riskMetrics: RiskMetrics;
  /** Whether the user is viewing their own bundle */
  isOwnBundle: boolean;
  /** Size variant of the pill */
  size?: 'sm' | 'md' | 'lg';
  /** Optional handler for detailed risk breakdown modal */
  onViewDetails?: (() => void) | undefined;
}

/**
 * Health Factor Pill Component
 *
 * Displays a minimal, clean indicator for leveraged position health.
 * Shows the health factor with risk-based color coding and a detailed
 * tooltip on hover/tap.
 *
 * Features:
 * - Multi-modal indicators (color + icon + animation) for accessibility
 * - Risk-based escalation (critical states get pulse animation)
 * - Portal-based tooltip with viewport-aware positioning
 * - Responsive sizing and mobile-friendly tap targets
 *
 * @example
 * ```tsx
 * <HealthFactorPill
 *   riskMetrics={data.risk_metrics}
 *   isOwnBundle={true}
 *   size="md"
 * />
 * ```
 */
export function HealthFactorPill({
  riskMetrics,
  isOwnBundle,
  size = 'md',
  onViewDetails,
}: HealthFactorPillProps) {
  const {
    isVisible: isHovered,
    setIsVisible: setIsHovered,
    isMounted,
    containerRef,
    tooltipRef,
  } = useTooltipState();

  const { health_rate } = riskMetrics;
  const config = getRiskConfig(health_rate);
  const sizeConfig = SIZE_CONFIGS[size];

  // Check if mobile for tap vs hover behavior
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const tooltipPosition = useTooltipPosition(
    isHovered,
    containerRef,
    tooltipRef,
  );

  // Animation for critical state (pulse)
  const shouldPulse =
    config.level === RiskLevel.RISKY || config.level === RiskLevel.CRITICAL;

  const dotAnimation = shouldPulse
    ? {
        animate: { opacity: [1, 0.5, 1] },
        transition: { duration: 2, repeat: Infinity },
      }
    : {};

  // Handle interactions
  const handleMouseEnter = () => {
    if (!isMobile) setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (!isMobile) setIsHovered(false);
  };

  const handleClick = () => {
    if (isMobile) {
      setIsHovered(!isHovered);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsHovered(!isHovered);
    }
  };

  // Tooltip content
  const tooltipContent = isHovered && isMounted && (
    <div
      ref={tooltipRef}
      className="fixed z-50 pointer-events-none"
      style={{
        top: `${tooltipPosition.top}px`,
        left: `${tooltipPosition.left}px`,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
      >
        <HealthRiskTooltip
          riskMetrics={riskMetrics}
          riskLevel={config.level}
          isOwnBundle={isOwnBundle}
          onViewDetails={onViewDetails}
        />
      </motion.div>
    </div>
  );

  return (
    <>
      <div
        ref={containerRef}
        className={`
          inline-flex items-center rounded-full cursor-pointer
          transition-all duration-200
          ${sizeConfig.container}
          ${config.colors.bg}
          ${config.colors.border}
          border
          hover:${config.colors.border.replace('/20', '/40')}
        `}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="status"
        aria-label={`${config.colors.ariaLabel}. Health Factor: ${health_rate.toFixed(2)}`}
        tabIndex={0}
      >
        {/* Status Dot */}
        <motion.span
          className={`${sizeConfig.dot} ${config.colors.dot} rounded-full flex-shrink-0`}
          aria-hidden="true"
          {...dotAnimation}
        />

        {/* Label and Value */}
        <span className={`${config.colors.text} font-medium whitespace-nowrap`}>
          <span className={sizeConfig.label}>Health Factor: </span>
          {health_rate.toFixed(2)}
        </span>

        {/* Icon for additional visual redundancy (accessibility) */}
        <span
          className={`${config.colors.text} text-xs font-bold`}
          aria-hidden="true"
        >
          {config.colors.icon}
        </span>
      </div>

      {/* Portal-based tooltip */}
      {isMounted && createPortal(tooltipContent, document.body)}
    </>
  );
}
