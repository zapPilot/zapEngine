import { ArrowRight } from 'lucide-react';

import { GradientButton } from '@/components/ui/GradientButton';

interface TransactionActionButtonProps {
  gradient: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
}

export function TransactionActionButton({
  gradient,
  disabled,
  label,
  onClick,
}: TransactionActionButtonProps) {
  return (
    <GradientButton
      gradient={gradient}
      className="w-full py-4 text-lg font-bold shadow-lg shadow-indigo-500/10 flex items-center justify-center gap-2 group"
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
    </GradientButton>
  );
}
