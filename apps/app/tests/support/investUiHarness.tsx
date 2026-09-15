import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, vi } from 'vitest';
interface NativeProps {
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityState?: {
    expanded?: boolean;
    disabled?: boolean;
    selected?: boolean;
  };
  onPress?: () => void;
  disabled?: boolean;
}
vi.mock('react-native', () => ({
  Text: ({ children }: NativeProps) => <span>{children}</span>,
  View: ({ children, accessibilityLabel, accessibilityState }: NativeProps) => (
    <div
      aria-label={accessibilityLabel}
      aria-disabled={accessibilityState?.disabled}
    >
      {children}
    </div>
  ),
  TextInput: ({
    value,
    onChangeText,
    onBlur,
    accessibilityLabel,
  }: {
    value: string;
    onChangeText?: (value: string) => void;
    onBlur?: () => void;
    accessibilityLabel?: string;
  }) => (
    <input
      aria-label={accessibilityLabel}
      value={value}
      onChange={(e) => onChangeText?.(e.target.value)}
      onBlur={onBlur}
    />
  ),
  Modal: ({ children, visible }: NativeProps & { visible: boolean }) =>
    visible ? <div role="dialog">{children}</div> : null,
}));
vi.mock('lucide-react-native', () => ({
  Check: () => null,
  ChevronDown: () => null,
  ChevronLeft: () => null,
  Circle: () => null,
  LoaderCircle: () => null,
  X: () => null,
  Lock: () => null,
  Wallet: () => null,
}));
vi.mock('@/components/token/ProtocolIcon', () => ({
  ProtocolIcon: () => null,
}));
vi.mock('@/components/token/TokenIcon', () => ({ TokenIcon: () => null }));
vi.mock('@/components/ui/ScreenScrollView', () => ({
  ScreenScrollView: ({ children }: NativeProps) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    accessibilityLabel,
    accessibilityState,
    onPress,
    disabled,
  }: NativeProps) => (
    <button
      type="button"
      aria-label={accessibilityLabel}
      aria-expanded={accessibilityState?.expanded}
      aria-selected={accessibilityState?.selected}
      onClick={onPress}
      disabled={disabled}
    >
      {children}
    </button>
  ),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
export async function renderInvestUi(element: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  cleanups.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return container;
}
export async function clickUi(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent === label,
  );
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => button.click());
}
export async function changeInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
