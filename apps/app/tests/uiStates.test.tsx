// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ErrorState } from '@/components/ui/ErrorState';
import { Callout } from '@/components/ui/Callout';
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock('@/components/ui/Tap', async () => ({
  Tap: (await import('./support/reactNativeStub')).reactNativeStub.Pressable,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});
async function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}
it('names the tab group, exposes selection and forwards the chosen value', async () => {
  const onChange = vi.fn();
  const page = await mount(
    <SegmentedControl
      accessibilityLabel="Chart range"
      value="month"
      onChange={onChange}
      options={[
        { value: 'month', label: 'Month', accessibilityLabel: 'Past month' },
        { value: 'year', label: 'Year', accessibilityLabel: 'Past year' },
      ]}
    />,
  );
  expect(
    page.querySelector('[role="tablist"]')?.getAttribute('aria-label'),
  ).toBe('Chart range');
  const tabs = page.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  expect(tabs[1]?.getAttribute('aria-selected')).toBe('false');
  await act(async () => tabs[1]!.click());
  expect(onChange).toHaveBeenCalledWith('year');
});
it('keeps technical errors collapsed and supports labelled retry and copy actions', async () => {
  const retry = vi.fn();
  const copy = vi.fn();
  const page = await mount(
    <ErrorState
      title="Unable to load"
      body="Please try again"
      retryLabel="Retry"
      onRetry={retry}
      details={{
        label: 'Technical details',
        message: 'upstream request 502',
        copyLabel: 'Copy details',
        onCopy: copy,
      }}
    />,
  );
  expect(page.textContent).not.toContain('upstream request 502');
  await act(async () =>
    page.querySelector<HTMLButtonElement>('[aria-label="Retry"]')!.click(),
  );
  expect(retry).toHaveBeenCalledOnce();
  const disclosure = page.querySelector<HTMLButtonElement>(
    '[aria-label="Technical details"]',
  )!;
  expect(disclosure.getAttribute('aria-expanded')).toBe('false');
  await act(async () => disclosure.click());
  expect(disclosure.getAttribute('aria-expanded')).toBe('true');
  expect(page.textContent).toContain('upstream request 502');
  const copyButton = Array.from(page.querySelectorAll('button')).find(
    (button) => button.textContent === 'Copy details',
  )!;
  await act(async () => copyButton.click());
  expect(copy).toHaveBeenCalledOnce();
});
it('does not invent a default error heading for inline notices', async () => {
  const page = await mount(
    <Callout tone="danger" body="Some balances are unavailable" />,
  );
  expect(page.textContent).toBe('Some balances are unavailable');
  expect(page.textContent).not.toContain('Something went wrong');
});
