import { type ReactNode, useCallback, useState } from 'react';

import { Z_INDEX } from '@/constants/designSystem';
import { ToastContext } from '@/providers/ToastContext';

import { Toast, ToastNotification } from '../components/ui/ToastNotification';

function createToastId(): string {
  return Math.random().toString(36).substring(7);
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toastData: Omit<Toast, 'id'>) => {
    const id = createToastId();
    const newToast: Toast = { ...toastData, id };

    setToasts((prev) => [...prev, newToast]);
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}

      <div
        className={`fixed top-4 right-4 ${Z_INDEX.TOAST} pointer-events-none`}
      >
        <div className="pointer-events-auto">
          {toasts.map((toast) => (
            <ToastNotification
              key={toast.id}
              toast={toast}
              onClose={hideToast}
            />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export { useToast } from '@/providers/ToastContext';
