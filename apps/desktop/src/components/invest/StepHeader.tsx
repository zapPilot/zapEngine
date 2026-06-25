import { ChevronLeft, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface StepHeaderProps {
  title: string;
  step: string;
}

const circleStyle = {
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.07)',
} as const;

/** Invest-flow top bar: back chevron, centered title + step label, close. */
export function StepHeader({ title, step }: StepHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between px-[18px] pt-2">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Back"
        className="zp-tap grid h-9 w-9 place-items-center rounded-full"
        style={circleStyle}
      >
        <ChevronLeft size={18} strokeWidth={2} className="text-ink-dim" />
      </button>
      <div className="text-center">
        <div className="text-[15px] font-semibold text-ink">{title}</div>
        <div className="mt-[3px] font-mono text-[9px] uppercase tracking-[.12em] text-ink-faint">
          {step}
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate('/home')}
        aria-label="Close"
        className="zp-tap grid h-9 w-9 place-items-center rounded-full"
        style={circleStyle}
      >
        <X size={15} strokeWidth={2} className="text-ink-dim" />
      </button>
    </div>
  );
}
