import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';

import { Z_INDEX } from '@/constants/design-system';

import { Toast, ToastNotification } from '../components/ui/ToastNotification';

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

function createToastId(): string {
  return Math.random().toString(36).substring(7);
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
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
