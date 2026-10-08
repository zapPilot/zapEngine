import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  available: true,
  assigned: true,
  assignment: {
    key: 'landing-waitlist-cta-v2',
    variant: 'baseline',
    exposureId: 'motion-test',
  },
  diagnostic: vi.fn(),
  clicked: vi.fn(),
  submitted: vi.fn(),
  capture: vi.fn(),
  attribution: vi.fn(),
}));
vi.mock('@/components/site/CtaExperiment', () => ({
  useCtaExperiment: () => ({
    assignment: mocks.available ? mocks.assignment : null,
    ensureAssignment: () => (mocks.assigned ? mocks.assignment : null),
  }),
}));
vi.mock('@/lib/analytics/events', () => ({
  trackCtaDiagnostic: mocks.diagnostic,
  trackCtaClicked: mocks.clicked,
  trackWaitlistSubmitted: mocks.submitted,
}));
vi.mock('@/lib/waitlist-attribution', () => ({
  captureWaitlistFirstTouch: mocks.capture,
  readWaitlistAttribution: mocks.attribution,
}));
import { WaitlistForm } from '../site/WaitlistForm';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.available = true;
  mocks.assigned = true;
  mocks.assignment.variant = 'baseline';
  mocks.attribution.mockReturnValue({
    utmSource: 'motion',
    firstTouchUtmSource: 'original',
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const begin = () => {
  render(<WaitlistForm />);
  const email = screen.getByLabelText('Email');
  fireEvent.focus(email);
  fireEvent.change(email, { target: { value: 'test@example.com' } });
  return email;
};
describe('inline Motion waitlist', () => {
  it('records opened and started once and preserves attribution and experiment payload', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const email = begin();
    fireEvent.focus(email);
    fireEvent.change(email, { target: { value: 'second@example.com' } });
    fireEvent.change(email, { target: { value: 'test@example.com' } });
    fireEvent.submit(email.closest('form')!);
    await screen.findByRole('status');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toContain('/waitlist');
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body)).toEqual({
      email: 'test@example.com',
      company: '',
      ctaLocation: 'join',
      ctaExperiment: mocks.assignment,
      utmSource: 'motion',
      firstTouchUtmSource: 'original',
    });
    expect(mocks.clicked).toHaveBeenCalledTimes(1);
    expect(
      mocks.diagnostic.mock.calls.filter(
        (c) => c[0] === 'waitlist_form_opened',
      ),
    ).toHaveLength(1);
    expect(
      mocks.diagnostic.mock.calls.filter(
        (c) => c[0] === 'waitlist_form_started',
      ),
    ).toHaveLength(1);
    expect(
      mocks.diagnostic.mock.calls.some((c) => c[0] === 'waitlist_form_closed'),
    ).toBe(false);
    expect(mocks.submitted).toHaveBeenCalledWith(
      'join',
      true,
      mocks.assignment,
    );
    expect(screen.getByRole('link', { name: /Discord/ })).toHaveAttribute(
      'href',
      'https://discord.gg/d3vXUtcFCJ',
    );
  });
  it.each([
    [429, 'rate_limited'],
    [503, 'server_error'],
    [400, 'request_rejected'],
  ])('reports HTTP %i and allows retry', async (status, reason) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
    const email = begin();
    fireEvent.submit(email.closest('form')!);
    await screen.findByRole('alert');
    expect(mocks.diagnostic).toHaveBeenCalledWith(
      'waitlist_form_error',
      mocks.assignment,
      { location: 'join', reason },
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Join waitlist' }),
      ).toBeEnabled(),
    );
  });
  it('reports network failure, required and invalid email without putting email in the URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<WaitlistForm />);
    const email = screen.getByLabelText('Email');
    expect(email.closest('form')).toHaveAttribute('method', 'post');
    fireEvent.invalid(email);
    expect(mocks.diagnostic).toHaveBeenCalledWith(
      'waitlist_form_error',
      mocks.assignment,
      { location: 'join', reason: 'required_email' },
    );
    fireEvent.change(email, { target: { value: 'invalid' } });
    fireEvent.invalid(email);
    expect(mocks.diagnostic).toHaveBeenCalledWith(
      'waitlist_form_error',
      mocks.assignment,
      { location: 'join', reason: 'invalid_email' },
    );
    fireEvent.submit(email.closest('form')!);
    await screen.findByRole('alert');
    expect(mocks.diagnostic).toHaveBeenCalledWith(
      'waitlist_form_error',
      mocks.assignment,
      { location: 'join', reason: 'network_or_timeout' },
    );
  });
  it('does not send twice while a request is pending and uses value-first copy', async () => {
    mocks.assignment.variant = 'value_first';
    const fetch = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    const email = begin();
    expect(
      screen.getByRole('button', { name: 'Get launch updates' }),
    ).toBeEnabled();
    fireEvent.submit(email.closest('form')!);
    fireEvent.submit(email.closest('form')!);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled();
  });
});

it('records visible only once at 50% and disconnects on unmount', () => {
  let callback: IntersectionObserverCallback;
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const { unmount } = render(<WaitlistForm />);
  const entry = (isIntersecting: boolean, intersectionRatio: number) =>
    ({ isIntersecting, intersectionRatio }) as IntersectionObserverEntry;
  callback!([entry(false, 0), entry(true, 0.49)], {} as IntersectionObserver);
  expect(mocks.diagnostic).not.toHaveBeenCalledWith(
    'waitlist_cta_visible',
    expect.anything(),
    expect.anything(),
  );
  callback!([entry(true, 0.5)], {} as IntersectionObserver);
  callback!([entry(true, 1)], {} as IntersectionObserver);
  expect(
    mocks.diagnostic.mock.calls.filter((c) => c[0] === 'waitlist_cta_visible'),
  ).toHaveLength(1);
  expect(observe).toHaveBeenCalledWith(
    screen.getByLabelText('Email').closest('form'),
  );
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
it('submits without an experiment or attribution when unavailable and skips observer after success', async () => {
  mocks.available = false;
  mocks.assigned = false;
  mocks.attribution.mockReturnValue(null);
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  const { rerender } = render(<WaitlistForm />);
  const email = screen.getByLabelText('Email');
  fireEvent.change(email, { target: { value: 'test@example.com' } });
  fireEvent.submit(email.closest('form')!);
  await screen.findByRole('status');
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
    email: 'test@example.com',
    company: '',
    ctaLocation: 'join',
  });
  expect(mocks.submitted).toHaveBeenCalledWith('join', false, null);
  mocks.available = true;
  rerender(<WaitlistForm />);
  expect(screen.getByRole('status')).toBeInTheDocument();
});

it('normalizes absent fields and surfaces the server rejection', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 });
  vi.stubGlobal('fetch', fetch);
  render(<WaitlistForm />);
  const form = screen.getByLabelText('Email').closest('form')!;
  for (const input of form.querySelectorAll('input')) input.disabled = true;
  fireEvent.submit(form);
  await screen.findByRole('alert');
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
    email: '',
    company: '',
  });
});

it('keeps the signup usable when the browser has no visibility observer', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  const email = begin();
  fireEvent.submit(email.closest('form')!);
  await screen.findByRole('status');
  expect(mocks.submitted).toHaveBeenCalledWith('join', true, mocks.assignment);
  expect(
    mocks.diagnostic.mock.calls.some(
      ([event]) => event === 'waitlist_cta_visible',
    ),
  ).toBe(false);
});
