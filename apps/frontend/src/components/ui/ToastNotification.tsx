import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  type LucideIcon,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
  link?:
    | {
        text: string;
        url: string;
      }
    | undefined;
  action?:
    | {
        label: string;
        onClick: () => void;
      }
    | undefined;
  duration?: number;
}

interface ToastNotificationProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const TOAST_STYLES: Record<
  Toast["type"],
  { Icon: LucideIcon; iconColor: string; borderColor: string; bgColor: string }
> = {
  success: {
    Icon: CheckCircle,
    iconColor: "text-green-400",
    borderColor: "border-green-600/30",
    bgColor: "bg-green-900/20",
  },
  error: {
    Icon: XCircle,
    iconColor: "text-red-400",
    borderColor: "border-red-600/30",
    bgColor: "bg-red-900/20",
  },
  info: {
    Icon: AlertCircle,
    iconColor: "text-blue-400",
    borderColor: "border-blue-600/30",
    bgColor: "bg-blue-900/20",
  },
  warning: {
    Icon: AlertTriangle,
    iconColor: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-900/20",
  },
};

export function ToastNotification({ toast, onClose }: ToastNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(toast.id);
    }, 300);
  }, [onClose, toast.id]);

  useEffect(() => {
    // Animate in
    setIsVisible(true);

    // Auto-dismiss
    const duration = toast.duration || 6000;
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.duration, handleClose]);

  const { Icon, iconColor, borderColor, bgColor } = TOAST_STYLES[toast.type];

  return (
    <div
      className={`
        mb-3 w-96 max-w-sm rounded-lg border backdrop-blur-sm transition-all duration-300 ease-out
        ${borderColor} ${bgColor}
        ${
          isVisible && !isExiting
            ? "translate-x-0 opacity-100"
            : "translate-x-full opacity-0"
        }
      `}
    >
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <Icon size={20} className={iconColor} />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-white text-sm break-words leading-tight">
                {toast.title}
              </h4>
              {toast.message && (
                <p className="text-xs text-gray-300 mt-1 break-words leading-relaxed whitespace-normal">
                  {toast.message}
                </p>
              )}
              {toast.link && (
                <a
                  href={toast.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors break-words"
                >
                  <span className="break-all">{toast.link.text}</span>
                  <ExternalLink size={12} className="flex-shrink-0" />
                </a>
              )}
              {/* Action button */}
              {toast.action && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    toast.action?.onClick();
                    handleClose();
                  }}
                  className="mt-2 w-full px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition font-medium"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors ml-2"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
