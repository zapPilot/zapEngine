import { type MouseEvent, type ReactElement } from "react";

import { getRegimeConfig } from "@/constants/regimeDisplay";

import {
  determineActiveDirection,
  resolveDisplayRegime,
  resolveEffectiveRegime,
  resolveTargetAllocation,
} from "./strategyCardResolvers";
import {
  type Regime,
  type SectionState,
  type SentimentData,
  type StrategyDirection,
  type WalletPortfolioDataWithDirection,
} from "./types";

export interface StrategyDetails {
  author: string | undefined;
  hideAllocationTarget: boolean | undefined;
  philosophy: string | undefined;
  zapAction: string | undefined;
}

export type StrategyCardDisplayConfig = ReturnType<
  typeof getRegimeConfig
> | null;

export interface StrategyCardViewModel {
  activeDirection: StrategyDirection;
  displayConfig: StrategyCardDisplayConfig;
  displayRegime: Regime | undefined;
  effectiveRegime: Regime | undefined;
  sentimentDisplay: ReactElement;
  strategyDetails: StrategyDetails;
  targetAllocation: ReturnType<typeof resolveTargetAllocation>;
}

function renderSentimentDisplay(
  sentimentSection: SectionState<SentimentData> | undefined,
  fallbackValue: string | number | undefined
): ReactElement {
  if (sentimentSection?.isLoading) {
    return (
      <span
        className="inline-block w-10 h-5 ml-2 align-middle bg-gray-800/50 rounded border border-gray-700/50 animate-pulse"
        title="Loading sentiment..."
      />
    );
  }

  return (
    <span
      className="text-sm font-mono text-gray-500 bg-gray-800/50 px-1.5 py-0.5 rounded border border-gray-700/50 ml-2 align-middle"
      title="Market Sentiment Score"
    >
      {sentimentSection?.data?.value ?? fallbackValue ?? "—"}
    </span>
  );
}

function getDisplayConfig(
  regime: Regime | undefined
): StrategyCardDisplayConfig {
  if (!regime) {
    return null;
  }

  return getRegimeConfig(regime.id);
}

function resolveActiveStrategy(
  displayRegime: Regime | undefined,
  activeDirection: StrategyDirection
) {
  if (!displayRegime) {
    return;
  }

  return (
    displayRegime.strategies[activeDirection] ||
    displayRegime.strategies.default
  );
}

function getStrategyDetails(
  activeStrategy:
    | {
        philosophy?: string;
        author?: string;
        useCase?: { zapAction?: string; hideAllocationTarget?: boolean };
      }
    | undefined
): StrategyDetails {
  return {
    philosophy: activeStrategy?.philosophy,
    author: activeStrategy?.author,
    zapAction: activeStrategy?.useCase?.zapAction,
    hideAllocationTarget: activeStrategy?.useCase?.hideAllocationTarget,
  };
}

export function resolveStrategyCardViewModel(
  data: WalletPortfolioDataWithDirection,
  currentRegime: Regime | undefined,
  sentimentSection: SectionState<SentimentData> | undefined,
  selectedRegimeId: string | null,
  selectedDirection: StrategyDirection | null
): StrategyCardViewModel | null {
  const effectiveRegime = resolveEffectiveRegime(
    currentRegime,
    sentimentSection
  );
  if (!effectiveRegime && !sentimentSection) {
    return null;
  }

  const displayRegime = resolveDisplayRegime(selectedRegimeId, effectiveRegime);
  const isViewingCurrent =
    displayRegime?.id !== undefined &&
    effectiveRegime?.id !== undefined &&
    displayRegime.id === effectiveRegime.id;
  const activeDirection = determineActiveDirection(
    displayRegime,
    selectedDirection,
    isViewingCurrent,
    data
  );
  const activeStrategy = resolveActiveStrategy(displayRegime, activeDirection);

  return {
    effectiveRegime,
    displayRegime,
    activeDirection,
    targetAllocation: resolveTargetAllocation(activeStrategy, displayRegime),
    sentimentDisplay: renderSentimentDisplay(
      sentimentSection,
      data.sentimentValue
    ),
    displayConfig: getDisplayConfig(effectiveRegime),
    strategyDetails: getStrategyDetails(activeStrategy),
  };
}

function isInteractiveCardTarget(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target instanceof HTMLElement ? event.target : null;
  return target?.closest('[data-interactive="true"]') !== null;
}

export function toggleCardExpansion(
  event: MouseEvent<HTMLElement>,
  displayRegime: Regime | undefined,
  setIsStrategyExpanded: (value: (previous: boolean) => boolean) => void
): void {
  if (!displayRegime || isInteractiveCardTarget(event)) {
    return;
  }

  setIsStrategyExpanded(previous => !previous);
}
