import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/ui/classNames";

interface CompactSelectorButtonProps {
  icon: ReactNode;
  label: string;
  value: string;
  isOpen?: boolean;
  onClick?: () => void;
  className?: string;
}

export function CompactSelectorButton({
  icon,
  label,
  value,
  isOpen = false,
  onClick,
  className,
}: CompactSelectorButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3 hover:border-gray-700 transition-colors text-left",
        className
      )}
    >
      {icon}
      <div className="flex-1 overflow-hidden">
        <div className="text-xs text-gray-500 font-bold uppercase">{label}</div>
        <div className="font-bold text-gray-200 truncate">{value}</div>
      </div>
      <ChevronDown
        className={cn(
          "w-4 h-4 text-gray-500 transition-transform",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}
