import { ToastContext } from '@zapengine/app-core/providers/ToastContext';
import type { Toast } from '@zapengine/app-core/providers/toastTypes';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useState,
} from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

interface ToastProviderProps {
  children: ReactNode;
}

function createToastId(): string {
  return Math.random().toString(36).slice(2);
}

function toastBorderClassName(type: Toast['type']): string {
  return type === 'error'
    ? 'border-error/40'
    : 'border-[rgba(212,197,163,.28)]';
}

function toastTitleClassName(type: Toast['type']): string {
  if (type === 'error') return 'text-error';
  if (type === 'warning') return 'text-[#ffd166]';
  return 'text-accent';
}

export function ToastProvider({ children }: ToastProviderProps): ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const hideToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toastData: Omit<Toast, 'id'>) => {
      const toast: Toast = { ...toastData, id: createToastId() };
      setToasts((current) => [...current.slice(-2), toast]);
      setTimeout(() => hideToast(toast.id), toast.duration ?? 4200);
    },
    [hideToast],
  );

  const handleToastPress = useCallback(
    (toast: Toast) => {
      hideToast(toast.id);
      if (toast.action) {
        toast.action.onClick();
        return;
      }
      if (toast.link) {
        void Linking.openURL(toast.link.url);
      }
    },
    [hideToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <View className="absolute inset-x-0 top-5 z-50 items-center gap-2 px-5">
        {toasts.map((toast) => (
          <Pressable
            key={toast.id}
            className={`w-full max-w-[330px] rounded-[16px] border bg-[#141416] px-4 py-3 shadow-lg ${toastBorderClassName(
              toast.type,
            )}`}
            onPress={() => handleToastPress(toast)}
          >
            <Text
              className={`font-sans-semibold text-[13px] ${toastTitleClassName(
                toast.type,
              )}`}
            >
              {toast.title}
            </Text>
            {toast.message ? (
              <Text className="mt-1 font-sans text-[11px] leading-4 text-ink-dim">
                {toast.message}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </ToastContext.Provider>
  );
}
