import { X } from "lucide-react";

import type { ModalHeaderProps } from "./types";

export function ModalHeader({
  title,
  subtitle,
  onClose,
  showCloseButton = true,
}: ModalHeaderProps) {
  return (
    <div className="mb-4">
      {showCloseButton && onClose && (
        <button
          onClick={onClose}
          className="float-right p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      )}
      <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
      {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
    </div>
  );
}
