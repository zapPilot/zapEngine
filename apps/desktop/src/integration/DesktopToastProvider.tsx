import { ToastContext } from '@zapengine/app-core/providers/ToastContext';
import type { Toast } from '@zapengine/app-core/providers/toastTypes';
import { type ReactNode, useCallback, useState } from 'react';

function createToastId(): string {
  return Math.random().toString(36).slice(2);
}

export function DesktopToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const hideToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toastData: Omit<Toast, 'id'>) => {
      const toast: Toast = { ...toastData, id: createToastId() };
      setToasts((current) => [...current.slice(-2), toast]);
      window.setTimeout(() => hideToast(toast.id), toast.duration ?? 4200);
    },
    [hideToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-5 z-[80] flex flex-col items-center gap-2 px-5">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            className="pointer-events-auto w-full max-w-[330px] rounded-[16px] px-4 py-3 text-left shadow-[0_18px_50px_rgba(0,0,0,.38)]"
            style={{
              background: '#141416',
              border:
                toast.type === 'error'
                  ? '1px solid rgba(255,107,107,.42)'
                  : '1px solid rgba(212,197,163,.28)',
            }}
            onClick={() => hideToast(toast.id)}
          >
            <div
              className="text-[13px] font-semibold"
              style={{
                color: toast.type === 'error' ? '#ff6b6b' : 'var(--accent)',
              }}
            >
              {toast.title}
            </div>
            {toast.message ? (
              <div className="mt-1 text-[11px] leading-4 text-ink-dim">
                {toast.message}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
