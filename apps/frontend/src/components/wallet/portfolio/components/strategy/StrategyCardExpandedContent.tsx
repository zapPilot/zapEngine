import { motion } from "framer-motion";
import type { ReactElement } from "react";

import { type Regime, regimes } from "@/components/wallet/regime/regimeData";
import type { StrategyDirection } from "@/components/wallet/regime/strategyLabels";
import { ANIMATIONS } from "@/constants/design-system";

import { RegimeSelector } from "./RegimeSelector";
import { StrategyAllocationDisplay } from "./StrategyAllocationDisplay";
import type { StrategyCardViewModel } from "./strategyCardViewModel";
import { StrategyDirectionTabs } from "./StrategyDirectionTabs";

interface StrategyCardExpandedContentProps {
  activeDirection: StrategyDirection;
  displayRegime: Regime;
  effectiveRegime: Regime | undefined;
  hideAllocationTarget: boolean | undefined;
  onSelectDirection: (direction: StrategyDirection) => void;
  onSelectRegime: (regimeId: string) => void;
  strategyAuthor: string | undefined;
  strategyPhilosophy: string | undefined;
  targetAllocation: StrategyCardViewModel["targetAllocation"];
  zapAction: string | undefined;
}

export function StrategyCardExpandedContent({
  activeDirection,
  displayRegime,
  effectiveRegime,
  hideAllocationTarget,
  onSelectDirection,
  onSelectRegime,
  strategyAuthor,
  strategyPhilosophy,
  targetAllocation,
  zapAction,
}: StrategyCardExpandedContentProps): ReactElement {
  return (
    <motion.div
      {...ANIMATIONS.EXPAND_COLLAPSE}
      className="relative z-10 mt-8 pt-8 border-t border-gray-800"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <RegimeSelector
          currentRegime={effectiveRegime}
          selectedRegime={displayRegime}
          onSelectRegime={onSelectRegime}
          regimes={regimes}
        />

        <div>
          <h4 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
            <span>Why this allocation?</span>
            <StrategyDirectionTabs
              regime={displayRegime}
              activeDirection={activeDirection}
              onSelectDirection={onSelectDirection}
            />
          </h4>
          <div className="space-y-6 text-sm text-gray-400">
            <div className="relative pl-4 border-l-2 border-purple-500/30">
              <p className="italic text-gray-300 mb-1">
                &ldquo;{strategyPhilosophy}&rdquo;
              </p>
              {strategyAuthor && (
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                  — {strategyAuthor}
                </p>
              )}
            </div>

            <div>
              <div className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                Smart Execution
              </div>
              <p className="leading-relaxed">
                {zapAction ||
                  "Zap Pilot automatically rebalances your portfolio to optimize for the current market regime."}
              </p>
            </div>

            <StrategyAllocationDisplay
              targetAllocation={targetAllocation}
              hideAllocationTarget={hideAllocationTarget}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
