import { ToastContext } from '@zapengine/app-core/providers/ToastContext';
import type { Toast } from '@zapengine/app-core/providers/toastTypes';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useState,
} from 'react';
import { Pressable, Text, View } from 'react-native';

interface ToastProviderProps {
  children: ReactNode;
}

function createToastId(): string {
  return Math.random().toString(36).slice(2);
}

function toastTitleColor(type: Toast['type']): string {
  return type === 'error' ? '#ff6b6b' : '#d4c5a3';
}

function toastBorderColor(type: Toast['type']): string {
  return type === 'error'
    ? 'rgba(255,107,107,.42)'
    : 'rgba(212,197,163,.28)';
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
      globalThis.setTimeout(() => hideToast(toast.id), toast.duration ?? 4200);
    },
    [hideToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 top-5 z-[80] items-center gap-2 px-5"
      >
        {toasts.map((toast) => (
          <Pressable
            key={toast.id}
            className="w-full max-w-[330px] rounded-[16px] bg-[#141416] px-4 py-3 shadow-lg"
            style={{
              borderWidth: 1,
              borderColor: toastBorderColor(toast.type),
            }}
            onPress={() => hideToast(toast.id)}
          >
            <Text
              className="font-sans-semibold text-[13px]"
              style={{ color: toastTitleColor(toast.type) }}
            >
              {toast.title}
            </Text>
            {toast.message ? (
              <Text className="mt-1 text-[11px] leading-4 text-ink-dim">
                {toast.message}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </ToastContext.Provider>
  );
}
