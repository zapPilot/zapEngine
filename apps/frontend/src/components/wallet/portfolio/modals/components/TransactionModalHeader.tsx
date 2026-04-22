import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { IntentVisualizer } from '../visualizers/IntentVisualizer';

interface TransactionModalHeaderProps {
  title: string;
  indicatorClassName: string;
  isSubmitting: boolean;
  onClose: () => void;
}

export function TransactionModalHeader({
  title,
  indicatorClassName,
  isSubmitting,
  onClose,
}: TransactionModalHeaderProps) {
  return (
    <div className="bg-gray-900/50 p-4 flex justify-between items-center border-b border-gray-800">
      <h3 className="font-bold text-white flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${indicatorClassName}`} />
        {title}
      </h3>
      {!isSubmitting && (
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      )}
    </div>
  );
}

type SuccessTone = 'green' | 'indigo';

const SUCCESS_TONE_STYLES: Record<SuccessTone, string> = {
  green: 'bg-green-500/10 border border-green-500/20 text-green-400',
  indigo: 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400',
};

interface SuccessBannerProps {
  message: string;
  tone: SuccessTone;
  extra?: ReactNode;
}

function SuccessBanner({ message, tone, extra }: SuccessBannerProps) {
  return (
    <div
      className={`mt-6 p-4 rounded-xl flex items-center gap-3 ${SUCCESS_TONE_STYLES[tone]}`}
    >
      <Check className="w-5 h-5 flex-shrink-0" />
      <div className="text-sm font-semibold">{message}</div>
      {extra ? <div className="ml-auto">{extra}</div> : null}
    </div>
  );
}

interface SubmittingStateProps {
  isSuccess: boolean;
  successMessage?: string;
  successTone?: SuccessTone;
  successExtra?: ReactNode;
}

export function SubmittingState({
  isSuccess,
  successMessage,
  successTone = 'indigo',
  successExtra,
}: SubmittingStateProps) {
  return (
    <div className="animate-in fade-in zoom-in duration-300">
      <div className="mb-6">
        <IntentVisualizer />
      </div>

      {isSuccess && successMessage ? (
        <SuccessBanner
          message={successMessage}
          tone={successTone}
          extra={successExtra}
        />
      ) : null}
    </div>
  );
}
