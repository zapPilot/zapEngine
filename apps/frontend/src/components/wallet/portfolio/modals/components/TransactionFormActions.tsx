import type { UseFormReturn } from "react-hook-form";

import type { TransactionFormData } from "@/types/domain/transaction";

import { TransactionActionButton } from "./TransactionActionButton";

interface AmountInputSectionProps {
  amount: string;
  onChange: (value: string) => void;
  usdPrice?: number | undefined;
  className?: string | undefined;
}

function AmountInputSection({
  amount,
  onChange,
  usdPrice,
  className,
}: AmountInputSectionProps) {
  const normalizedAmount = parseFloat(amount || "0");
  const amountUsd = (normalizedAmount * (usdPrice ?? 1)).toLocaleString();

  return (
    <div className={className ?? "relative"}>
      <div className="absolute top-0 left-0 text-xs font-bold text-gray-500 uppercase tracking-wider">
        Amount
      </div>
      <input
        type="number"
        value={amount}
        onChange={event => onChange(event.target.value)}
        placeholder="0.00"
        className="w-full bg-transparent text-4xl font-mono font-bold text-white placeholder-gray-800 focus:outline-none py-6 border-b border-gray-800 focus:border-indigo-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="absolute top-6 right-0 text-sm text-gray-500 flex items-center gap-1">
        ≈ ${amountUsd}
      </div>
    </div>
  );
}

interface QuickPercentPillsProps {
  onSelect: (pct: number) => void;
  values?: number[];
}

function QuickPercentPills({
  onSelect,
  values = [0.25, 0.5, 0.75, 1],
}: QuickPercentPillsProps) {
  return (
    <div className="flex gap-2">
      {values.map(pct => (
        <button
          key={pct}
          onClick={() => onSelect(pct)}
          className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 text-xs font-bold py-2 rounded-lg border border-gray-800 transition-colors"
        >
          {pct === 1 ? "MAX" : `${pct * 100}%`}
        </button>
      ))}
    </div>
  );
}

interface TransactionFormActionsWithFormProps {
  form: UseFormReturn<TransactionFormData>;
  amount: string;
  usdPrice?: number | undefined;
  onQuickSelect: (pct: number) => void;
  actionLabel: string;
  actionDisabled: boolean;
  actionGradient: string;
  onAction: () => void;
  className?: string | undefined;
  amountClassName?: string | undefined;
}

export function TransactionFormActionsWithForm({
  form,
  amount,
  usdPrice,
  onQuickSelect,
  actionLabel,
  actionDisabled,
  actionGradient,
  onAction,
  className,
  amountClassName,
}: TransactionFormActionsWithFormProps) {
  return (
    <div className={className ?? "flex flex-col gap-6"}>
      <AmountInputSection
        className={amountClassName}
        amount={amount}
        onChange={value =>
          form.setValue("amount", value, { shouldValidate: true })
        }
        usdPrice={usdPrice}
      />

      <QuickPercentPills onSelect={onQuickSelect} />

      <TransactionActionButton
        gradient={actionGradient}
        disabled={actionDisabled}
        onClick={onAction}
        label={actionLabel}
      />
    </div>
  );
}
