import { type Transition } from "framer-motion";

import type { ComponentSize } from "@/types/ui/ui.types";

export type LoadingColor =
  | "primary"
  | "secondary"
  | "white"
  | "success"
  | "warning"
  | "blue"
  | "gray"
  | "green"
  | "red";

export const ARIA_LABEL_PROP = "aria-label" as const;
export const ARIA_HIDDEN_PROP = "aria-hidden" as const;
export const DATA_TEST_ID_PROP = "data-testid" as const;

export const BASE_SKELETON_CLASS = "bg-gray-200 animate-pulse";
export const SR_ONLY_CLASS = "sr-only";

export const DEFAULT_SPINNER_LABEL = "Loading";
export const DEFAULT_SKELETON_LABEL = "Loading content";

export const PULSE_ANIMATION = {
  initial: { opacity: 0.6 },
  animate: { opacity: [0.6, 1, 0.6] },
};

export const PULSE_TRANSITION = {
  duration: 1.5,
  repeat: Infinity,
  ease: [0.42, 0, 0.58, 1] as const,
} satisfies Transition;

export const sizeClasses: Record<ComponentSize, string> = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
  xl: "w-12 h-12",
};

/** Aliases: primary=blue, success=green for semantic usage */
export const colorClasses: Record<LoadingColor, string> = {
  primary: "text-blue-600",
  secondary: "text-gray-600",
  blue: "text-blue-600",
  white: "text-white",
  gray: "text-gray-400",
  green: "text-green-600",
  success: "text-green-600",
  red: "text-red-600",
  warning: "text-yellow-600",
};

export interface BaseLoadingProps {
  className?: string;
  [ARIA_LABEL_PROP]?: string;
  [ARIA_HIDDEN_PROP]?: boolean | "true" | "false";
  [DATA_TEST_ID_PROP]?: string;
}
