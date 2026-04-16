import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { fadeInOut } from "@/lib/ui/animationVariants";
import type { SectionState } from "@/types/portfolio-progressive";

interface SectionWrapperProps<T> {
  state: SectionState<T>;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
  className?: string;
}

/**
 * Generic wrapper for progressive dashboard sections
 * Handles loading, error, and data states consistently
 */
export function SectionWrapper<T>({
  state,
  skeleton,
  children,
  className = "",
}: SectionWrapperProps<T>) {
  // Error State
  if (state.error) {
    return (
      <div
        className={`bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 ${className}`}
      >
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-200">
            Failed to load section
          </p>
          <p className="text-xs text-red-400 mt-0.5 truncate">
            {state.error.message}
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
          title="Retry"
        >
          <RefreshCw className="w-4 h-4 text-red-400" />
        </button>
      </div>
    );
  }

  // Loading State
  if (state.isLoading) {
    return (
      <div className={className}>
        <AnimatePresence mode="wait">
          <motion.div
            variants={fadeInOut}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            {skeleton || (
              <div className="animate-pulse bg-gray-800/50 rounded-xl h-48 w-full border border-gray-700/50" />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // Data State
  if (!state.data) {
    return null;
  }

  return (
    <div className={className}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {children(state.data)}
      </motion.div>
    </div>
  );
}
