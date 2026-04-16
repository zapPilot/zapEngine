import { ArrowRight } from "lucide-react";
import { type ReactElement, useState } from "react";

import { Modal, ModalContent } from "@/components/ui/modal";
import { useWalletProvider } from "@/providers/WalletProvider";
import { transactionServiceMock } from "@/services";
import type { RebalanceModalProps } from "@/types/ui/ui.types";

import {
  SubmittingState,
  TransactionActionButton,
  TransactionModalHeader,
} from "./components/TransactionModalParts";
import { resolveActionLabel } from "./utils/actionLabelUtils";

export function RebalanceModal({
  isOpen,
  onClose,
  currentAllocation,
  targetAllocation,
}: RebalanceModalProps): ReactElement {
  const { isConnected } = useWalletProvider();

  const [status, setStatus] = useState<"idle" | "submitting" | "success">(
    "idle"
  );

  const projected = transactionServiceMock.computeProjectedAllocation(
    100,
    currentAllocation,
    targetAllocation
  );

  const handleSubmit = async () => {
    setStatus("submitting");
    try {
      await transactionServiceMock.simulateRebalance(
        100,
        currentAllocation,
        targetAllocation
      );
      setStatus("success");
    } catch {
      setStatus("idle");
    }
  };

  const resetState = () => {
    setStatus("idle");
    onClose();
  };

  const isSubmitting = status === "submitting" || status === "success";
  const actionLabel = resolveActionLabel({
    isConnected,
    isReady: true,
    readyLabel: "Confirm Rebalance",
    notReadyLabel: "",
  });

  return (
    <Modal isOpen={isOpen} onClose={resetState} maxWidth="md">
      <ModalContent className="p-0 overflow-hidden bg-gray-950 border-gray-800">
        <TransactionModalHeader
          title="Rebalance Portfolio"
          indicatorClassName="bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
          isSubmitting={isSubmitting}
          onClose={resetState}
        />

        <div className="p-6">
          {isSubmitting ? (
            <SubmittingState
              isSuccess={status === "success"}
              successMessage="Rebalance Successfully Executed!"
              successTone="indigo"
            />
          ) : (
            <div className="flex flex-col gap-6">
              {/* Side-by-Side Comparison Grid */}
              <div className="bg-gray-900/30 rounded-2xl border border-gray-800 p-6">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 items-center">
                  {/* Current Column */}
                  <div className="text-center space-y-4">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                      Current
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-5xl font-black font-mono text-gray-400 tabular-nums">
                          {currentAllocation.crypto.toFixed(0)}
                          <span className="text-xl text-gray-700">%</span>
                        </div>
                        <div className="text-xs text-purple-400/50 uppercase tracking-wider mt-1">
                          Crypto
                        </div>
                      </div>
                      <div>
                        <div className="text-5xl font-black font-mono text-gray-400 tabular-nums">
                          {currentAllocation.stable.toFixed(0)}
                          <span className="text-xl text-gray-700">%</span>
                        </div>
                        <div className="text-xs text-emerald-400/50 uppercase tracking-wider mt-1">
                          Stable
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <ArrowRight className="w-6 h-6 text-gray-600 hidden md:block" />
                    <div className="w-full h-px bg-gray-800 md:hidden" />
                  </div>

                  {/* Projected Column */}
                  <div className="text-center space-y-4">
                    <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                      Projected
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-5xl font-black font-mono text-purple-200 tabular-nums">
                          {projected.crypto.toFixed(0)}
                          <span className="text-xl text-purple-500/40">%</span>
                        </div>
                        <div className="text-xs text-purple-400 uppercase tracking-wider mt-1">
                          Crypto
                        </div>
                      </div>
                      <div>
                        <div className="text-5xl font-black font-mono text-emerald-200 tabular-nums">
                          {projected.stable.toFixed(0)}
                          <span className="text-xl text-emerald-500/40">%</span>
                        </div>
                        <div className="text-xs text-emerald-400 uppercase tracking-wider mt-1">
                          Stable
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <TransactionActionButton
                gradient="from-indigo-600 to-purple-600"
                disabled={!isConnected}
                onClick={handleSubmit}
                label={actionLabel}
              />
            </div>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
