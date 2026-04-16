import { motion } from "framer-motion";
import type { ReactNode } from "react";

import type { ComponentSize, SpinnerVariant } from "@/types/ui/ui.types";

import {
  ARIA_HIDDEN_PROP,
  ARIA_LABEL_PROP,
  type BaseLoadingProps,
  colorClasses,
  DATA_TEST_ID_PROP,
  DEFAULT_SPINNER_LABEL,
  type LoadingColor,
  sizeClasses,
  SR_ONLY_CLASS,
} from "./constants";

export interface SpinnerProps extends BaseLoadingProps {
  size?: ComponentSize;
  color?: LoadingColor;
  variant?: SpinnerVariant;
  label?: string;
}

interface SpinnerContainerProps {
  className: string;
  "data-testid": string;
  "data-size": ComponentSize;
  role?: "status";
  "aria-label"?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

function buildContainerProps(
  size: ComponentSize,
  className: string,
  testId: string,
  finalAriaLabel: string,
  ariaHidden: boolean | "true" | "false" | undefined
): SpinnerContainerProps {
  const isHidden = ariaHidden === true || ariaHidden === "true";
  const baseProps: SpinnerContainerProps = {
    className: `inline-flex items-center ${sizeClasses[size]} ${className}`,
    [DATA_TEST_ID_PROP]: testId,
    "data-size": size,
  };

  if (isHidden) {
    return {
      ...baseProps,
      [ARIA_HIDDEN_PROP]: ariaHidden,
    };
  }

  return {
    ...baseProps,
    role: "status",
    [ARIA_LABEL_PROP]: finalAriaLabel,
  };
}

function renderDotsSpinner(color: LoadingColor): ReactNode {
  return (
    <div className="flex items-center space-x-1">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className={`w-2 h-2 ${colorClasses[color]} bg-current rounded-full`}
          animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  );
}

function renderPulseSpinner(
  size: ComponentSize,
  color: LoadingColor
): ReactNode {
  return (
    <motion.div
      className={`${sizeClasses[size]} ${colorClasses[color]} bg-current rounded-full`}
      animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

function renderDefaultSpinner(
  size: ComponentSize,
  color: LoadingColor
): ReactNode {
  return (
    <motion.svg
      className={`${sizeClasses[size]} ${colorClasses[color]} animate-spin`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      animate={{ rotate: 360 }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <circle
        className="opacity-75"
        cx="12"
        cy="12"
        r="6"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray="15.708"
        strokeDashoffset="11.781"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

function renderSpinnerVisual(
  variant: SpinnerVariant,
  size: ComponentSize,
  color: LoadingColor
): ReactNode {
  switch (variant) {
    case "dots":
      return renderDotsSpinner(color);
    case "pulse":
      return renderPulseSpinner(size, color);
    default:
      return renderDefaultSpinner(size, color);
  }
}

export function Spinner({
  size = "md",
  color = "primary",
  variant = "default",
  className = "",
  label = DEFAULT_SPINNER_LABEL,
  [ARIA_LABEL_PROP]: ariaLabel,
  [ARIA_HIDDEN_PROP]: ariaHidden,
  [DATA_TEST_ID_PROP]: testId = "loading-spinner",
}: SpinnerProps) {
  const finalAriaLabel = ariaLabel ?? label;
  const containerProps = buildContainerProps(
    size,
    className,
    testId,
    finalAriaLabel,
    ariaHidden
  );

  return (
    <div {...containerProps}>
      {renderSpinnerVisual(variant, size, color)}
      <span className={SR_ONLY_CLASS}>{label}</span>
    </div>
  );
}
