import { ToastContext } from '@zapengine/app-core/providers/ToastContext';
import type { Toast } from '@zapengine/app-core/providers/toastTypes';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Linking, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@zapengine/design-tokens/tokens';
import { ToastItem } from '@/components/ui/ToastItem';

interface ToastProviderProps {
  children: ReactNode;
}

function createToastId(): string {
  return Math.random().toString(36).slice(2);
}

export function ToastProvider({ children }: ToastProviderProps): ReactElement {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
    };
  }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const hideToast = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toastData: Omit<Toast, 'id'>) => {
      const toast: Toast = { ...toastData, id: createToastId() };
      setToasts((current) => [...current.slice(-2), toast]);
      timers.current.set(
        toast.id,
        setTimeout(() => hideToast(toast.id), toast.duration ?? 4200),
      );
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
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 z-50 gap-2 px-5"
        style={{
          top: insets.top + tokens.gutter.compact,
          alignItems:
            width >= tokens.breakpoint.expanded ? 'flex-end' : 'center',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onPress={() => handleToastPress(toast)}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}
