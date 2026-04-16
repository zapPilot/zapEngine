import { motion } from "framer-motion";
import { ReactNode } from "react";

import { fadeInUp, SMOOTH_TRANSITION } from "@/lib/ui/animationVariants";
import { BaseComponentProps } from "@/types/ui/ui.types";

type AriaLive = "off" | "polite" | "assertive";

// Variant configurations
const VARIANT_STYLES = {
  glass: "glass-morphism",
  empty: "glass-morphism text-center",
  error: "glass-morphism",
  solid: "bg-gray-900/50",
} as const;

const PADDING_STYLES = {
  none: "",
  sm: "p-4",
  md: "p-4 sm:p-6",
  lg: "p-4 sm:p-6 lg:p-8",
  xl: "p-6",
} as const;

const BORDER_RADIUS_STYLES = {
  sm: "rounded-lg",
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-2xl sm:rounded-3xl",
  "2xl": "rounded-3xl",
} as const;

interface BaseCardProps extends BaseComponentProps {
  children: ReactNode;
  variant?: keyof typeof VARIANT_STYLES;
  padding?: keyof typeof PADDING_STYLES;
  borderRadius?: keyof typeof BORDER_RADIUS_STYLES;
  border?: boolean;
  shadow?: boolean;
  animate?: boolean;
  role?: string;
  ariaLive?: AriaLive;
}

/**
 * BaseCard - Unified card component with variant support
 *
 * Consolidates styling patterns across GlassCard and EmptyStateCard.
 * Provides flexible configuration for padding, borders, shadows, and animations.
 *
 * @example
 * // Glass morphism card (default)
 * <BaseCard>Content</BaseCard>
 *
 * @example
 * // Empty state with centered content
 * <BaseCard variant="empty" padding="lg">
 *   <EmptyIcon />
 *   <Title />
 * </BaseCard>
 *
 * @example
 * // Custom styling without animation
 * <BaseCard
 *   variant="solid"
 *   padding="sm"
 *   borderRadius="md"
 *   animate={false}
 * >
 *   Content
 * </BaseCard>
 */
export function BaseCard({
  children,
  className = "",
  variant = "glass",
  padding = "xl",
  borderRadius = "2xl",
  border = true,
  shadow = false,
  animate = true,
  testId,
  role,
  ariaLive,
}: BaseCardProps) {
  // Compose class names
  const variantClass = VARIANT_STYLES[variant];
  const paddingClass = PADDING_STYLES[padding];
  const borderRadiusClass = BORDER_RADIUS_STYLES[borderRadius];
  const borderClass = border ? "border border-gray-800" : "";
  const shadowClass = shadow ? "shadow-xl shadow-purple-500/10" : "";

  const fullClassName = [
    variantClass,
    paddingClass,
    borderRadiusClass,
    borderClass,
    shadowClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Conditional animation wrapper
  if (animate) {
    return (
      <motion.div
        {...fadeInUp}
        transition={SMOOTH_TRANSITION}
        className={fullClassName}
        data-testid={testId}
        role={role}
        aria-live={ariaLive}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div
      className={fullClassName}
      data-testid={testId}
      role={role}
      aria-live={ariaLive}
    >
      {children}
    </div>
  );
}
