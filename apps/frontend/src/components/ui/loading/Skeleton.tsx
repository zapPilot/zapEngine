import { motion } from "framer-motion";
import type { ReactNode } from "react";

import type { SkeletonVariant } from "@/types/ui/ui.types";

import {
  ARIA_LABEL_PROP,
  BASE_SKELETON_CLASS,
  type BaseLoadingProps,
  DATA_TEST_ID_PROP,
  DEFAULT_SKELETON_LABEL,
  PULSE_ANIMATION,
  PULSE_TRANSITION,
  SR_ONLY_CLASS,
} from "./constants";

export interface SkeletonProps extends BaseLoadingProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  lines?: number;
  spacing?: string;
}

type SkeletonStyle = Record<string, string | number>;

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  text: "h-4 rounded",
  circular: "rounded-full",
  rectangular: "rounded",
  rounded: "rounded-lg",
};

function buildSkeletonStyle(
  variant: SkeletonVariant,
  width: string | number | undefined,
  height: string | number | undefined
): SkeletonStyle {
  const style: SkeletonStyle = {};

  if (width !== undefined) {
    style["width"] = width;
  } else if (variant === "text") {
    style["width"] = "100%";
  }

  if (height !== undefined) {
    style["height"] = height;
  } else if (variant === "circular" && width !== undefined) {
    style["height"] = width;
  }

  return style;
}

function getLineStyle(
  baseStyle: SkeletonStyle,
  variant: SkeletonVariant,
  index: number,
  lines: number
): SkeletonStyle {
  const isLastTextLine = index === lines - 1 && variant === "text";
  const width = isLastTextLine ? "75%" : (baseStyle["width"] ?? "100%");
  return {
    ...baseStyle,
    width,
  };
}

function renderSkeletonLines(
  lines: number,
  variant: SkeletonVariant,
  spacing: string,
  baseStyle: SkeletonStyle
): ReactNode {
  return Array.from({ length: lines }).map((_, index) => (
    <motion.div
      key={index}
      className={`${BASE_SKELETON_CLASS} ${VARIANT_CLASSES[variant]} ${
        index < lines - 1 ? spacing : ""
      }`}
      style={getLineStyle(baseStyle, variant, index, lines)}
      initial={PULSE_ANIMATION.initial}
      animate={PULSE_ANIMATION.animate}
      transition={{
        ...PULSE_TRANSITION,
        delay: index * 0.1,
      }}
    />
  ));
}

export function Skeleton({
  variant = "rectangular",
  width,
  height,
  lines = 1,
  spacing = "mb-2",
  className = "",
  [ARIA_LABEL_PROP]: ariaLabel = DEFAULT_SKELETON_LABEL,
  [DATA_TEST_ID_PROP]: testId = "loading-skeleton",
}: SkeletonProps) {
  const style = buildSkeletonStyle(variant, width, height);

  if (lines > 1) {
    return (
      <div
        className={className}
        data-testid={testId}
        role="status"
        aria-label={ariaLabel}
        data-variant={variant}
        data-lines={lines}
      >
        {renderSkeletonLines(lines, variant, spacing, style)}
        <span className={SR_ONLY_CLASS}>{ariaLabel}</span>
      </div>
    );
  }

  return (
    <motion.div
      className={`${BASE_SKELETON_CLASS} ${VARIANT_CLASSES[variant]} ${className}`}
      style={style}
      data-testid={testId}
      role="status"
      aria-label={ariaLabel}
      initial={PULSE_ANIMATION.initial}
      animate={PULSE_ANIMATION.animate}
      transition={PULSE_TRANSITION}
      data-variant={variant}
      data-lines={lines}
    >
      <span className={SR_ONLY_CLASS}>{ariaLabel}</span>
    </motion.div>
  );
}
