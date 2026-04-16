import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { type Regime } from "@/components/wallet/regime/regimeData";
import { cn } from "@/lib/ui/classNames";

import type { StrategyCardDisplayConfig } from "./strategyCardViewModel";

const REGIME_BADGE_CLASS_NAME =
  "w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold border shadow-inner flex-shrink-0";

interface StrategyCardHeaderProps {
  displayConfig: StrategyCardDisplayConfig;
  displayRegime: Regime | undefined;
  effectiveRegime: Regime | undefined;
  isStrategyExpanded: boolean;
  sentimentDisplay: ReactNode;
  strategyPhilosophy: string | undefined;
}

export function StrategyCardHeader({
  displayConfig,
  displayRegime,
  effectiveRegime,
  isStrategyExpanded,
  sentimentDisplay,
  strategyPhilosophy,
}: StrategyCardHeaderProps): ReactElement {
  return (
    <motion.div
      layout="position"
      className="relative z-10 flex items-start justify-between"
    >
      <div className="flex items-center gap-6">
        <div
          className={cn(
            REGIME_BADGE_CLASS_NAME,
            displayConfig?.bg,
            displayConfig?.border
          )}
        >
          {effectiveRegime && displayConfig ? (
            <span className={displayConfig.color} data-testid="regime-badge">
              {effectiveRegime.id.toUpperCase()}
            </span>
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gray-800 flex items-center justify-center border border-gray-700 shadow-inner">
              <div className="w-12 h-4 bg-gray-700/50 rounded animate-pulse" />
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
            Current Strategy
          </div>
          <div className="text-2xl font-bold text-white mb-1 flex items-center">
            {effectiveRegime ? (
              effectiveRegime.label
            ) : (
              <div className="w-32 h-8 bg-gray-700/50 rounded animate-pulse mr-2" />
            )}
            {sentimentDisplay}
          </div>
          <div className="text-sm text-gray-400 italic mb-2 min-h-[1.25rem] flex items-center">
            {strategyPhilosophy ? (
              <span>&ldquo;{strategyPhilosophy}&rdquo;</span>
            ) : (
              <div className="w-48 h-4 bg-gray-700/50 rounded animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {displayRegime && (
        <div
          className={`p-2 rounded-full bg-gray-800 text-gray-400 transition-transform duration-300 ${
            isStrategyExpanded ? "rotate-180" : ""
          }`}
          role="button"
        >
          <ChevronDown className="w-5 h-5" />
        </div>
      )}
    </motion.div>
  );
}
