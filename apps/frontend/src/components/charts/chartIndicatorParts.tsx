/**
 * ChartIndicator Sub-Components
 * Reusable indicator primitives for chart hover states.
 */

import { motion } from "framer-motion";
import { memo, type ReactNode } from "react";

import { CHART_COLORS } from "@/constants/portfolio";
import type { ChartHoverState } from "@/types/ui/chartHover";
import { getSharpeColor } from "@/utils/chartHoverUtils";

const STROKE_COLOR = "#ffffff";
const HIGH_VOL_STROKE_COLOR = "#f59e0b";
const RECOVERY_COLOR = "#10b981";
const HIGH_VOLATILITY_THRESHOLD = 25;

const CIRCLE_ANIMATION = {
  initial: { opacity: 0, scale: 0 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0 },
  transition: { duration: 0.2 },
} as const;

export function IndicatorWrapper({
  point,
  label,
  children,
}: {
  point: ChartHoverState;
  label: string;
  children: ReactNode;
}) {
  return (
    <g
      role="img"
      aria-label={label}
      style={{ pointerEvents: "none" }}
      data-chart-type={point.chartType}
    >
      <title>{label}</title>
      {children}
    </g>
  );
}

function IndicatorCircle({
  point,
  r,
  sw,
  fill,
  delay = 0,
  dx = 0,
  dy = 0,
  className,
}: {
  point: ChartHoverState;
  r: number;
  sw: number;
  fill: string;
  delay?: number;
  dx?: number;
  dy?: number;
  className?: string;
}) {
  return (
    <motion.circle
      cx={point.x + dx}
      cy={point.y + dy}
      r={r}
      fill={fill}
      stroke={STROKE_COLOR}
      strokeWidth={sw}
      initial={CIRCLE_ANIMATION.initial}
      animate={CIRCLE_ANIMATION.animate}
      exit={CIRCLE_ANIMATION.exit}
      transition={{ ...CIRCLE_ANIMATION.transition, delay }}
      className={`drop-shadow-lg ${className ?? ""}`}
    />
  );
}

interface VariantCircleProps {
  point: ChartHoverState;
  r: number;
  sw: number;
  color: string;
  label: string;
}

export const SingleCircle = memo(function SingleCircle({
  point,
  r,
  sw,
  color,
}: Omit<VariantCircleProps, "label">) {
  const effectiveColor =
    point.chartType === "sharpe" ? getSharpeColor(point.sharpe || 0) : color;

  const isHighVol =
    point.chartType === "volatility" &&
    point.volatility > HIGH_VOLATILITY_THRESHOLD;

  return (
    <>
      <IndicatorCircle point={point} r={r} sw={sw} fill={effectiveColor} />
      {isHighVol && (
        <motion.circle
          cx={point.x}
          cy={point.y}
          r={r + 6}
          fill="none"
          stroke={HIGH_VOL_STROKE_COLOR}
          strokeWidth="2"
          initial={{ opacity: 0.6, scale: 1 }}
          animate={{ opacity: 0, scale: 2 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
      )}
    </>
  );
});

export const MultiCircle = memo(function MultiCircle({
  point,
  r,
  sw,
  color,
  label,
}: VariantCircleProps) {
  if (point.chartType !== "asset-allocation") {
    return (
      <IndicatorWrapper point={point} label={label}>
        <SingleCircle point={point} r={r} sw={sw} color={color} />
      </IndicatorWrapper>
    );
  }

  const colors = [
    { v: point.btc, c: CHART_COLORS.btc },
    { v: point.eth, c: CHART_COLORS.eth },
    { v: point.stablecoin, c: CHART_COLORS.stablecoin },
    { v: point.altcoin, c: CHART_COLORS.altcoin },
  ].filter(i => i.v > 1);

  if (colors.length <= 1) {
    return (
      <IndicatorWrapper point={point} label={label}>
        <IndicatorCircle
          point={point}
          r={r}
          sw={sw}
          fill={colors[0]?.c ?? CHART_COLORS.btc}
        />
      </IndicatorWrapper>
    );
  }

  return (
    <IndicatorWrapper point={point} label={label}>
      {colors.slice(0, 3).map((item, i) => (
        <IndicatorCircle
          key={i}
          point={point}
          r={r - i * 0.5}
          sw={sw}
          fill={item.c}
          dx={i * 3}
          dy={-i * 3}
          delay={i * 0.05}
        />
      ))}
    </IndicatorWrapper>
  );
});

export const FlaggedCircle = memo(function FlaggedCircle({
  point,
  r,
  sw,
  color,
  label,
}: VariantCircleProps) {
  const isRecovery =
    point.chartType === "drawdown-recovery" && point.isRecoveryPoint;

  return (
    <IndicatorWrapper point={point} label={label}>
      <IndicatorCircle point={point} r={r} sw={sw} fill={color} />
      {isRecovery && (
        <motion.g
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <line
            x1={point.x}
            y1={point.y - r}
            x2={point.x}
            y2={point.y - r - 12}
            stroke={RECOVERY_COLOR}
            strokeWidth="2"
          />
          <path
            d={`M ${point.x} ${point.y - r - 12} L ${point.x + 8} ${point.y - r - 9} L ${point.x} ${point.y - r - 6} Z`}
            fill={RECOVERY_COLOR}
            stroke={STROKE_COLOR}
            strokeWidth="1"
          />
        </motion.g>
      )}
    </IndicatorWrapper>
  );
});
