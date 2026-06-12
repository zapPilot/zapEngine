import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Loader,
  X,
  Zap,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { Modal, ModalContent } from '@/components/ui/modal';

interface DecodedCall {
  type: 'approve' | 'supply' | 'unknown';
  token: string;
  spender?: string;
  amount?: string;
  receiver?: string;
  to?: string;
  value?: string;
}

interface AssetChange {
  type: 'transfer' | 'mint';
  token: string;
  tokenAddress: string;
  from: string;
  to: string;
  amount: string;
}

interface TenderlyPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewData: {
    previewId: string;
    batchHash: string;
    decodedCalls: DecodedCall[];
    assetChanges: AssetChange[];
    gasEstimate: string;
    expiresAt: number;
  } | null;
  onConfirm: () => Promise<void>;
  isSigningAndSending: boolean;
}

function formatAddress(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatAmount(amountStr: string, decimals = 6): string {
  try {
    const val = BigInt(amountStr);
    const divisor = BigInt(10 ** decimals);
    const integerPart = val / divisor;
    const fractionalPart = val % divisor;

    let fractionStr = fractionalPart.toString().padStart(decimals, '0');
    // trim trailing zeros without regex to avoid super-linear backtracking
    while (
      fractionStr.length > 0 &&
      fractionStr[fractionStr.length - 1] === '0'
    ) {
      fractionStr = fractionStr.slice(0, -1);
    }

    return fractionStr.length > 0
      ? `${integerPart.toString()}.${fractionStr}`
      : integerPart.toString();
  } catch {
    return amountStr;
  }
}

export function TenderlyPreviewModal({
  isOpen,
  onClose,
  previewData,
  onConfirm,
  isSigningAndSending,
}: TenderlyPreviewModalProps): ReactElement {
  if (!previewData) {
    return <></>;
  }

  const isExpired = Date.now() > previewData.expiresAt;

  return (
    <Modal
      isOpen={isOpen}
      onClose={
        isSigningAndSending
          ? () => {
              /* noop while signing */
            }
          : onClose
      }
      maxWidth="md"
    >
      <ModalContent className="p-0 overflow-hidden bg-gray-950 border border-gray-800 rounded-3xl shadow-2xl backdrop-blur-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800/80 bg-gray-900/30">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)] animate-pulse" />
            <span className="text-sm font-bold text-gray-200 uppercase tracking-wider">
              Tenderly Simulation Preview
            </span>
          </div>
          {!isSigningAndSending && (
            <button
              onClick={onClose}
              className="p-1 text-gray-400 rounded-lg hover:bg-gray-800/60 hover:text-white transition-all duration-200"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Status Alert */}
          <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl flex gap-3 items-start">
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-emerald-400">
                Simulation Succeeded
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                All batch calls successfully simulated on the Base fork without
                reverts.
              </div>
            </div>
          </div>

          {/* Gas & Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900/30 border border-gray-800/60 rounded-2xl p-4 flex items-center gap-3">
              <Zap className="w-5 h-5 text-indigo-400" />
              <div>
                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                  Gas Estimate
                </div>
                <div className="text-sm font-bold text-gray-200 font-mono">
                  {Number(previewData.gasEstimate).toLocaleString()} units
                </div>
              </div>
            </div>

            <div className="bg-gray-900/30 border border-gray-800/60 rounded-2xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                  Status
                </div>
                <div className="text-sm font-bold text-gray-200">
                  Pre-flight OK
                </div>
              </div>
            </div>
          </div>

          {/* Call Logs */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Execution Sequence
            </div>
            <div className="space-y-3">
              {previewData.decodedCalls.map((call, idx) => (
                <div
                  key={idx}
                  className="bg-gray-900/40 border border-gray-800/80 rounded-2xl p-4 flex justify-between items-center gap-3 hover:border-gray-800 transition-all duration-300"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-xl bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400 font-mono">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-200 capitalize">
                        {call.type === 'approve'
                          ? 'Approve Spender'
                          : 'Supply Pool'}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Target: {formatAddress(call.token)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    {call.amount && (
                      <div className="text-sm font-black text-gray-200 font-mono">
                        {formatAmount(call.amount)} USDC
                      </div>
                    )}
                    {call.spender && (
                      <div className="text-[10px] text-gray-500">
                        Spender: {formatAddress(call.spender)}
                      </div>
                    )}
                    {call.receiver && (
                      <div className="text-[10px] text-gray-500">
                        To: {formatAddress(call.receiver)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Expected Balance Changes */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Expected Balance Changes
            </div>
            <div className="bg-gray-900/20 border border-gray-800/80 rounded-2xl p-4 space-y-3">
              {previewData.assetChanges.map((change, idx) => {
                const isDeduction = change.type === 'transfer';
                return (
                  <div
                    key={idx}
                    className="flex justify-between items-center text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${isDeduction ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      />
                      <span className="text-gray-400">
                        {isDeduction ? 'Deduct' : 'Receive'} {change.token}
                      </span>
                    </div>
                    <span
                      className={`font-mono font-bold ${isDeduction ? 'text-rose-400' : 'text-emerald-400'}`}
                    >
                      {isDeduction ? '-' : '+'}
                      {formatAmount(change.amount)} {change.token}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {isExpired && (
            <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-2xl text-xs text-rose-400 text-center">
              This preview has expired. Please close and try again.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-800/80 bg-gray-900/20">
          <button
            type="button"
            onClick={onClose}
            disabled={isSigningAndSending}
            className="flex-1 py-3.5 rounded-xl border border-gray-800 text-gray-300 font-medium hover:bg-gray-800/40 active:bg-gray-800/80 transition-all duration-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSigningAndSending || isExpired}
            className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-medium hover:opacity-95 active:opacity-90 transition-all duration-200 shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSigningAndSending ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>Sign & Send...</span>
              </>
            ) : (
              <>
                <span>Sign & Send</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
