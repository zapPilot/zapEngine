// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FundSheetHost } from '@/components/fund/FundSheetHost';
const m = vi.hoisted(() => ({
  visible: false,
  ownerValid: true,
  complete: false,
  progress: null as object | null,
  step: 'amount',
  controller: vi.fn(),
  report: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@/providers/FundFlowProvider', () => ({
  useFundFlow: () => ({ visible: m.visible, step: m.step }),
  useFundControllerState: () => ({
    ownerValid: m.ownerValid,
    ownerKey: 'owner',
    report: m.report,
  }),
}));
vi.mock('@/integration/useInvestExecution', () => ({
  useInvestExecution: () => ({ reviewedProgress: m.progress }),
}));
vi.mock('@/components/fund/useFundExecutionController', () => ({
  useFundExecutionController: (input: unknown) => {
    m.controller(input);
    return { routeComplete: m.complete, hlpModel: { hlpStatus: 'idle' } };
  },
}));
vi.mock('@/components/fund/FundAmountStep', () => ({
  FundAmountStep: () => <span>Amount</span>,
}));
vi.mock('@/components/fund/FundReviewStep', () => ({
  FundReviewStep: () => <span>Review</span>,
}));
vi.mock('@/components/fund/FundProgressStep', () => ({
  FundProgressStep: () => (m.visible ? <span>Progress</span> : null),
}));
vi.mock('@zapengine/app-core/providers/ToastContext', () => ({
  useToast: () => ({ showToast: m.toast }),
}));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({ t: (key: string) => key }),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host.remove();
  vi.clearAllMocks();
  m.progress = null;
  m.complete = false;
  m.visible = false;
  m.ownerValid = true;
});
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await render();
}
async function render() {
  await act(async () => root!.render(<FundSheetHost />));
}
it('keeps the controller alive while closed and announces background completion once', async () => {
  m.progress = { phase: 'confirming' };
  await mount();
  expect(m.controller).toHaveBeenLastCalledWith({ visible: false });
  expect(host.textContent).toBe('');
  m.complete = true;
  await render();
  expect(m.toast).toHaveBeenCalledOnce();
  await render();
  expect(m.toast).toHaveBeenCalledOnce();
  m.visible = true;
  await render();
  expect(host.textContent).toBe('Progress');
  expect(m.controller).toHaveBeenLastCalledWith({ visible: true });
  m.ownerValid = false;
  m.visible = false;
  await render();
  const calls = m.controller.mock.calls.length;
  await render();
  expect(m.controller.mock.calls.length).toBe(calls);
});
it('mounts amount and review only when the sheet is open', async () => {
  await mount();
  expect(host.textContent).toBe('');
  m.visible = true;
  await render();
  expect(host.textContent).toBe('Amount');
  m.step = 'review';
  await render();
  expect(host.textContent).toBe('Review');
  m.visible = false;
  await render();
  expect(host.textContent).toBe('');
});
