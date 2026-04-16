import { ReactNode } from "react";

import { cn } from "@/lib/ui/classNames";

interface ActionCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function ActionCard({
  title,
  subtitle,
  icon,
  children,
  footer,
  className,
}: ActionCardProps) {
  return (
    <div
      className={cn(
        "max-w-md mx-auto bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl shadow-black/20 border border-gray-100 dark:border-gray-800",
        className
      )}
    >
      {(title || subtitle || icon) && (
        <div className="flex items-center justify-between mb-8">
          <div>
            {subtitle && (
              <div className="text-sm text-gray-500 font-medium uppercase tracking-wide mb-1">
                {subtitle}
              </div>
            )}
            {title && (
              <div className="text-2xl font-medium text-gray-900 dark:text-white">
                {title}
              </div>
            )}
          </div>
          {icon && (
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
        </div>
      )}

      <div className="space-y-8">{children}</div>

      {footer && (
        <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-800">
          {footer}
        </div>
      )}
    </div>
  );
}
