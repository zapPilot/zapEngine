import { AnimatePresence, motion } from "framer-motion";
import { Gauge } from "lucide-react";
import { type MouseEvent, type ReactElement, useState } from "react";

import { cn } from "@/lib/ui/classNames";

import { StrategyCardSkeleton } from "../../views/DashboardSkeleton";
import { StrategyCardExpandedContent } from "./StrategyCardExpandedContent";
import { StrategyCardHeader } from "./StrategyCardHeader";
import {
  resolveStrategyCardViewModel,
  toggleCardExpansion,
} from "./strategyCardViewModel";
import {
  type Regime,
  type SectionState,
  type SentimentData,
  type StrategyDirection,
  type WalletPortfolioDataWithDirection,
} from "./types";

const STYLES = {
  cardBase:
    "bg-gray-900/40 backdrop-blur-sm border rounded-2xl p-6 relative overflow-hidden group cursor-pointer transition-all duration-200",
  cardExpanded:
    "row-span-2 md:col-span-2 border-purple-500/30 shadow-lg shadow-purple-500/10",
  cardCollapsed:
    "border-gray-800 hover:border-purple-500/20 hover:bg-gray-900/60",
} as const;

function getCardClassName(isExpanded: boolean): string {
  return `${STYLES.cardBase} ${isExpanded ? STYLES.cardExpanded : STYLES.cardCollapsed}`;
}

export interface StrategyCardProps {
  data: WalletPortfolioDataWithDirection;
  currentRegime: Regime | undefined;
  isLoading?: boolean;
  /** Independent sentiment section for progressive loading */
  sentimentSection?: SectionState<SentimentData>;
}

export function StrategyCard({
  data,
  currentRegime,
  isLoading = false,
  sentimentSection,
}: StrategyCardProps): ReactElement | null {
  const [isStrategyExpanded, setIsStrategyExpanded] = useState(false);
  const [selectedRegimeId, setSelectedRegimeId] = useState<string | null>(null);
  const [selectedDirection, setSelectedDirection] =
    useState<StrategyDirection | null>(null);

  if (isLoading) {
    return <StrategyCardSkeleton />;
  }

  const viewModel = resolveStrategyCardViewModel(
    data,
    currentRegime,
    sentimentSection,
    selectedRegimeId,
    selectedDirection
  );
  if (!viewModel) {
    return null;
  }

  const {
    activeDirection,
    displayConfig,
    displayRegime,
    effectiveRegime,
    sentimentDisplay,
    strategyDetails,
    targetAllocation,
  } = viewModel;

  function handleStrategyCardClick(event: MouseEvent<HTMLDivElement>): void {
    toggleCardExpansion(event, displayRegime, setIsStrategyExpanded);
  }

  function handleSelectRegime(regimeId: string): void {
    setSelectedRegimeId(regimeId);
    setSelectedDirection(null);
  }

  function handleSelectDirection(direction: StrategyDirection): void {
    setSelectedDirection(direction);
  }

  return (
    <motion.div
      data-testid="strategy-card"
      layout
      className={getCardClassName(isStrategyExpanded)}
      onClick={handleStrategyCardClick}
    >
      <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
        <Gauge
          className={cn(
            "w-32 h-32",
            displayConfig ? displayConfig.color : "text-purple-500"
          )}
        />
      </div>

      <StrategyCardHeader
        displayConfig={displayConfig}
        displayRegime={displayRegime}
        effectiveRegime={effectiveRegime}
        isStrategyExpanded={isStrategyExpanded}
        sentimentDisplay={sentimentDisplay}
        strategyPhilosophy={strategyDetails.philosophy}
      />

      <AnimatePresence>
        {isStrategyExpanded && displayRegime ? (
          <StrategyCardExpandedContent
            activeDirection={activeDirection}
            displayRegime={displayRegime}
            effectiveRegime={effectiveRegime}
            hideAllocationTarget={strategyDetails.hideAllocationTarget}
            onSelectDirection={handleSelectDirection}
            onSelectRegime={handleSelectRegime}
            strategyAuthor={strategyDetails.author}
            strategyPhilosophy={strategyDetails.philosophy}
            targetAllocation={targetAllocation}
            zapAction={strategyDetails.zapAction}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
