import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { memo, type ReactElement, type ReactNode } from "react";

import { cn } from "@/lib/ui/classNames";
import { InteractiveComponentProps } from "@/types/ui/ui.types";

interface GradientButtonProps extends InteractiveComponentProps {
  children: ReactNode;
  onClick?: () => void;
  gradient: string;
  shadowColor?: string;
  icon?: LucideIcon;
}

function GradientButtonComponent({
  children,
  onClick,
  gradient,
  shadowColor,
  icon: Icon,
  disabled = false,
  className = "",
  testId,
}: GradientButtonProps): ReactElement {
  const fullClassName = cn(
    "p-4 rounded-2xl text-white font-semibold flex items-center justify-center space-x-2 transition-all duration-300",
    `bg-gradient-to-r ${gradient}`,
    shadowColor && `hover:shadow-lg hover:shadow-${shadowColor}/25`,
    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    className
  );

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.02, y: -1 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={fullClassName}
      data-testid={testId}
    >
      {Icon && <Icon className="w-5 h-5" />}
      {children}
    </motion.button>
  );
}

export const GradientButton = memo(GradientButtonComponent);

GradientButton.displayName = "GradientButton";
