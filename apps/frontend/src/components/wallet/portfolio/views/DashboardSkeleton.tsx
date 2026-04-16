/**
 * Dashboard Loading Skeletons
 *
 * Content-aware skeletons that show real UI labels/buttons
 * while only using pulsing placeholders for dynamic data (numbers, charts)
 */

import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  Info,
  Zap,
} from "lucide-react";

import { GradientButton } from "@/components/ui";
import { ASSET_COLORS } from "@/constants/assets";
import { GRADIENTS } from "@/constants/design-system";

import { AllocationLegend } from "../components/allocation/AllocationLegend";

interface SkeletonButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

/**
 * Reusable skeleton button for loading states
 */
function SkeletonButton({ icon: Icon, label }: SkeletonButtonProps) {
  return (
    <button
      disabled
      className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg border bg-gray-800/30 text-gray-600 border-gray-800 cursor-not-allowed"
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

/** Skeleton legend items with placeholder percentages using consistent ASSET_COLORS */
const SKELETON_LEGEND_ITEMS = [
  { symbol: "BTC", percentage: 0, color: ASSET_COLORS.BTC, label: "BTC" },
  { symbol: "ETH", percentage: 0, color: ASSET_COLORS.ETH, label: "ETH" },
  {
    symbol: "Stables",
    percentage: 0,
    color: ASSET_COLORS.USDT,
    label: "Stables",
  },
];

/**
 * Balance Card Skeleton
 * Shows real labels and disabled buttons, skeleton only for balance value
 */
export function BalanceCardSkeleton() {
  return (
    <div
      className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 flex flex-col justify-center"
      aria-hidden="true"
    >
      {/* Real Label */}
      <div className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-2">
        Net Worth
      </div>

      {/* Skeleton: Balance Value */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <div className="h-12 w-48 bg-gray-700/50 rounded-lg mb-4 animate-pulse" />
          {/* Skeleton: ROI Badge */}
          <div className="flex items-center gap-3">
            <div className="h-6 w-16 bg-gray-800/50 rounded animate-pulse" />
            <div className="h-4 w-24 bg-gray-800/50 rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Real Buttons (disabled) */}
      <div className="grid grid-cols-2 gap-3">
        <SkeletonButton icon={ArrowDownCircle} label="Deposit" />
        <SkeletonButton icon={ArrowUpCircle} label="Withdraw" />
      </div>
    </div>
  );
}

/**
 * Strategy Card Skeleton
 * Shows real label and icons, skeleton for regime badge and text
 */
export function StrategyCardSkeleton() {
  return (
    <div
      className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-2xl p-8"
      aria-hidden="true"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-6">
          {/* Skeleton: Regime Badge */}
          <div className="w-20 h-20 rounded-2xl bg-gray-800 border border-gray-700 animate-pulse" />

          <div className="space-y-3">
            {/* Real Label */}
            <div className="text-xs text-gray-500 font-bold uppercase tracking-widest flex items-center gap-2">
              Current Strategy
              <Info className="w-3 h-3" />
            </div>

            {/* Skeleton: Title */}
            <div className="h-8 w-40 bg-gray-700/50 rounded animate-pulse" />

            {/* Skeleton: Philosophy text */}
            <div className="h-4 w-64 bg-gray-800/50 rounded animate-pulse" />
          </div>
        </div>

        {/* Real Chevron Icon */}
        <div className="p-2 rounded-full bg-gray-800 text-gray-400">
          <ChevronDown className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

/**
 * Portfolio Composition Skeleton
 * Shows real title, chips labels, and button; skeleton for bar/percentages
 */
export function PortfolioCompositionSkeleton() {
  return (
    <div
      className="bg-gray-900/20 border border-gray-800 rounded-2xl p-8"
      aria-hidden="true"
    >
      <div className="flex justify-between items-end mb-8">
        <div>
          {/* Real Title */}
          <h2 className="text-xl font-bold text-white mb-1">
            Portfolio Composition
          </h2>
          {/* Drift Indicator Skeleton */}
          <div className="h-4 w-24 bg-gray-800/50 rounded animate-pulse" />
        </div>
        {/* Real Button (disabled) */}
        <GradientButton
          gradient={GRADIENTS.PRIMARY}
          icon={Zap}
          className="h-8 text-xs opacity-50 cursor-not-allowed"
          disabled
        >
          Rebalance
        </GradientButton>
      </div>

      {/* Skeleton: Composition Bar */}
      <div className="h-24 w-full bg-gray-900/50 rounded-xl border border-gray-800 animate-pulse" />

      {/* Reuse AllocationLegend with placeholder skeleton items */}
      <AllocationLegend items={SKELETON_LEGEND_ITEMS} className="mt-4 px-1" />
    </div>
  );
}

/**
 * Complete Dashboard Skeleton
 * Combines all dashboard component skeletons for initial page load
 */
export function DashboardSkeleton() {
  return (
    <div
      data-testid="dashboard-loading"
      role="status"
      aria-label="Loading dashboard data"
      className="space-y-6"
    >
      {/* Hero Section: Balance + Strategy Cards (side by side on desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" aria-hidden="true">
        <BalanceCardSkeleton />
        <StrategyCardSkeleton />
      </div>

      {/* Portfolio Composition */}
      <div aria-hidden="true">
        <PortfolioCompositionSkeleton />
      </div>

      {/* Screen reader announcement */}
      <span className="sr-only">Loading your portfolio dashboard...</span>
    </div>
  );
}
