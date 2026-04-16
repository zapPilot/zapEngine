import { AlertCircle } from "lucide-react";
import { useState } from "react";

import { EmptyStateCard } from "@/components/ui/EmptyStateCard";
import { cn } from "@/lib/ui/classNames";

import { RebalancePanel } from "./components/RebalancePanel";
import { TransactionPanel } from "./components/TransactionPanel";

const TRADING_MODES = ["rebalance", "deposit", "withdraw"] as const;
type TradingMode = (typeof TRADING_MODES)[number];

interface TradingViewProps {
  userId: string | undefined;
}

export function TradingView({ userId }: TradingViewProps) {
  const [activeMode, setActiveMode] = useState<TradingMode>("rebalance");

  if (!userId) {
    return (
      <EmptyStateCard
        icon={AlertCircle}
        message="Connect wallet to access trading"
      />
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <div className="bg-gray-50 dark:bg-gray-900 min-h-[600px] flex flex-col items-center pt-8 relative">
        {/* Segmented Control */}
        <div className="bg-white dark:bg-gray-900 p-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-800 mb-12 flex gap-1">
          {TRADING_MODES.map(m => (
            <button
              key={m}
              onClick={() => setActiveMode(m)}
              className={cn(
                "px-6 py-2 rounded-full text-sm font-medium transition-all capitalize",
                activeMode === m
                  ? "bg-gray-900 dark:bg-white text-white dark:text-black shadow-sm"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="w-full max-w-4xl px-4 pb-20">
          {activeMode === "rebalance" && <RebalancePanel userId={userId} />}
          {(activeMode === "deposit" || activeMode === "withdraw") && (
            <TransactionPanel mode={activeMode} />
          )}
        </div>
      </div>
    </div>
  );
}
