import { ArrowRight, Layers, LineChart, Zap } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Modal, ModalContent } from "@/components/ui/modal";
import {
  SubmittingState,
  TransactionModalHeader,
} from "@/components/wallet/portfolio/modals/components/TransactionModalParts";
import { cn } from "@/lib/ui/classNames";

import {
  VariationImpact,
  VariationRoute,
  VariationStrategy,
} from "./ReviewModalTabs";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
  title?: string;
}

type TabId = "strategy" | "impact" | "route";

const TABS: { id: TabId; label: string; icon: typeof LineChart }[] = [
  { id: "impact", label: "Impact", icon: Layers },
  { id: "strategy", label: "Strategy", icon: LineChart },
  { id: "route", label: "Route", icon: Zap },
];

function renderTabContent(activeTab: TabId): ReactNode {
  switch (activeTab) {
    case "strategy":
      return <VariationStrategy />;
    case "impact":
      return <VariationImpact />;
    case "route":
      return <VariationRoute />;
    default:
      return null;
  }
}

export function ReviewModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  title = "Review Execution",
}: ReviewModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("impact");

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <ModalContent className="p-0 overflow-hidden bg-gray-950 border-gray-800 flex flex-col max-h-[90vh]">
        <TransactionModalHeader
          title={title}
          indicatorClassName="bg-indigo-500"
          isSubmitting={isSubmitting}
          onClose={onClose}
        />

        {/* Tab Switcher */}
        {!isSubmitting && (
          <div className="flex p-2 bg-gray-900/50 border-b border-gray-800 gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all",
                  activeTab === tab.id
                    ? "bg-gray-800 text-white shadow-sm ring-1 ring-white/10"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {isSubmitting ? (
            <SubmittingState isSuccess={false} />
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {renderTabContent(activeTab)}
            </div>
          )}
        </div>

        {!isSubmitting && (
          <div className="p-6 pt-2 border-t border-gray-800 bg-gray-950">
            <button
              onClick={onConfirm}
              className="group w-full py-4 rounded-2xl bg-white text-black font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
            >
              Sign & Execute
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <p className="text-[10px] text-gray-500 text-center mt-4 uppercase tracking-widest font-medium">
              Secured by MPC & Hardware Isolation
            </p>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}
