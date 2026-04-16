import {
  INVEST_SUB_TAB_IDS,
  type InvestSubTab,
  MARKET_SECTION_IDS,
  type MarketSection,
  PORTFOLIO_TAB_IDS,
  type TabType,
} from "@/types";

export interface PortfolioRouteState {
  tab: TabType;
  invest: InvestSubTab;
  market: MarketSection;
}

export interface PortfolioRouteStatePatch {
  tab?: TabType;
  invest?: InvestSubTab;
  market?: MarketSection;
}

type SearchParamsLike = Pick<URLSearchParams, "get" | "toString">;

const DEFAULT_ROUTE_STATE: PortfolioRouteState = {
  tab: "dashboard",
  invest: "trading",
  market: "overview",
};

function isMember<TValue extends string>(
  values: readonly TValue[],
  value: string | null
): value is TValue {
  return value !== null && values.includes(value as TValue);
}

function parseTab(value: string | null): TabType {
  return isMember(PORTFOLIO_TAB_IDS, value) ? value : DEFAULT_ROUTE_STATE.tab;
}

function parseInvestSubTab(value: string | null): InvestSubTab {
  return isMember(INVEST_SUB_TAB_IDS, value)
    ? value
    : DEFAULT_ROUTE_STATE.invest;
}

function parseMarketSection(value: string | null): MarketSection {
  return isMember(MARKET_SECTION_IDS, value)
    ? value
    : DEFAULT_ROUTE_STATE.market;
}

/**
 * Parse the shareable portfolio route state from the current search params.
 *
 * Missing or invalid values fall back to the canonical defaults so the UI can
 * render deterministically without mutating the URL on initial load.
 *
 * @param searchParams - Current URL search params.
 * @returns The normalized portfolio route state.
 *
 * @example
 * ```typescript
 * const state = readPortfolioRouteState(new URLSearchParams("tab=invest&invest=market"));
 * // => { tab: "invest", invest: "market", market: "overview" }
 * ```
 */
export function readPortfolioRouteState(
  searchParams: SearchParamsLike
): PortfolioRouteState {
  return {
    tab: parseTab(searchParams.get("tab")),
    invest: parseInvestSubTab(searchParams.get("invest")),
    market: parseMarketSection(searchParams.get("market")),
  };
}

/**
 * Build the next query params for portfolio navigation state while preserving
 * unrelated bundle params.
 *
 * Child params are only written when their parent view is active so copied
 * links stay canonical.
 *
 * @param searchParams - Current URL search params.
 * @param patch - Requested route state changes.
 * @returns The next search params with canonical portfolio state.
 *
 * @example
 * ```typescript
 * const next = buildPortfolioRouteSearchParams(
 *   new URLSearchParams("userId=abc"),
 *   { tab: "invest", invest: "market", market: "relative-strength" }
 * );
 * // => userId=abc&tab=invest&invest=market&market=relative-strength
 * ```
 */
export function buildPortfolioRouteSearchParams(
  searchParams: SearchParamsLike,
  patch: PortfolioRouteStatePatch
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(searchParams.toString());
  const currentRouteState = readPortfolioRouteState(nextSearchParams);

  const nextTab = patch.tab ?? currentRouteState.tab;
  const nextInvest = patch.invest ?? currentRouteState.invest;
  const nextMarket = patch.market ?? currentRouteState.market;

  nextSearchParams.set("tab", nextTab);

  if (nextTab !== "invest") {
    nextSearchParams.delete("invest");
    nextSearchParams.delete("market");
    return nextSearchParams;
  }

  nextSearchParams.set("invest", nextInvest);

  if (nextInvest === "market") {
    nextSearchParams.set("market", nextMarket);
  } else {
    nextSearchParams.delete("market");
  }

  return nextSearchParams;
}
