import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let CtaExperiment: typeof import('../landing-v2/CtaExperiment').CtaExperiment;
let AppCtaLink: typeof import('../landing-v2/AppCtaLink').AppCtaLink;
import {
  resolveCtaVariant,
  ctaEventProperties,
  subscribeCtaVariant,
} from '@/lib/analytics/cta-experiment';

const sdk = vi.hoisted(() => ({
  capture: vi.fn(),
  getFeatureFlag: vi.fn(),
  has_opted_out_capturing: vi.fn(),
  onFeatureFlags: vi.fn(),
  unsubscribe: vi.fn(),
  callback: null as (() => void) | null,
}));
vi.mock('posthog-js', () => ({ default: sdk }));
let observerCallback: IntersectionObserverCallback;
const disconnect = vi.fn();
const observe = vi.fn();
function renderCta() {
  return render(
    <CtaExperiment>
      <AppCtaLink location="hero" className="cta">
        Join waitlist
      </AppCtaLink>
    </CtaExperiment>,
  );
}
const events = () => sdk.capture.mock.calls.map(([name]) => name);
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'test');
  ({ CtaExperiment } = await import('../landing-v2/CtaExperiment'));
  ({ AppCtaLink } = await import('../landing-v2/AppCtaLink'));
  sdk.callback = null;
  sdk.has_opted_out_capturing.mockReturnValue(false);
  sdk.getFeatureFlag.mockReturnValue('value_first');
  sdk.onFeatureFlags.mockImplementation((callback) => {
    sdk.callback = callback;
    return sdk.unsubscribe;
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
  Reflect.deleteProperty(window.navigator, 'doNotTrack');
});

function flags() {
  act(() => sdk.callback?.());
}
function visible(ratio = 1) {
  act(() =>
    observerCallback(
      [
        { isIntersecting: true, intersectionRatio: ratio },
      ] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
}

describe('CTA experiment exposure and signup', () => {
  it('renders the assigned CTA and sends ordered progress without email or input text', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ status: 'joined' }, { status: 201 }));
    renderCta();
    flags();
    expect(
      screen.getByRole('button', { name: 'Get launch updates' }),
    ).toBeVisible();
    visible(0.2);
    expect(events()).not.toContain('waitlist_cta_visible');
    visible();
    visible();
    fireEvent.click(screen.getByRole('button', { name: 'Get launch updates' }));
    expect(
      screen.getByText(/Follow the programmable portfolio runtime/),
    ).toBeVisible();
    const email = screen.getByPlaceholderText('you@example.com');
    expect(email.closest('form')).toHaveClass('ph-no-capture');
    fireEvent.change(email, { target: { value: 'private@example.com' } });
    fireEvent.change(email, { target: { value: 'private2@example.com' } });
    fireEvent.submit(email.closest('form')!);
    expect(await screen.findByText('You’re on the list ✓')).toBeVisible();
    expect(events()).toEqual([
      'landing_cta_exposed',
      'waitlist_cta_visible',
      'waitlist_cta_clicked',
      'waitlist_form_opened',
      'waitlist_form_started',
      'waitlist_submit_attempted',
      'waitlist_submitted',
    ]);
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain('private');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.ctaExperiment).toMatchObject({
      key: 'landing-waitlist-cta-v2',
      variant: 'value_first',
    });
    expect(body.ctaExperiment.exposureId).toBe(
      sdk.capture.mock.calls[0]?.[1]?.cta_exposure_id,
    );
    flags();
    expect(
      events().filter((event) => event === 'landing_cta_exposed'),
    ).toHaveLength(1);
  });

  it('freezes baseline if a visitor clicks before flags load; late flags cannot move arms', () => {
    renderCta();
    fireEvent.click(screen.getByRole('button', { name: 'Join waitlist' }));
    flags();
    expect(
      screen.queryByRole('button', { name: 'Get launch updates' }),
    ).toBeNull();
    expect(sdk.capture.mock.calls[0]?.[1]).toMatchObject({
      cta_variant: 'baseline',
    });
    expect(events().slice(0, 4)).toEqual([
      'landing_cta_exposed',
      'waitlist_cta_visible',
      'waitlist_cta_clicked',
      'waitlist_form_opened',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Close waitlist' }));
    expect(sdk.capture).toHaveBeenLastCalledWith(
      'waitlist_form_closed',
      expect.objectContaining({ started: false, submitted: false }),
      { transport: 'sendBeacon' },
    );
  });

  it('falls back to observational baseline after a blocked flag request and cleans up subscriptions', () => {
    vi.useFakeTimers();
    const view = renderCta();
    act(() => vi.advanceTimersByTime(2000));
    flags();
    expect(sdk.capture.mock.calls[0]?.[1]?.cta_variant).toBe('baseline');
    view.unmount();
    expect(sdk.unsubscribe).toHaveBeenCalled();
  });

  it.each([429, 503, 400])(
    'captures bounded HTTP failure reason for %i and permits retry',
    async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('private response body', { status }),
      );
      renderCta();
      flags();
      fireEvent.click(
        screen.getByRole('button', { name: 'Get launch updates' }),
      );
      const email = screen.getByPlaceholderText('you@example.com');
      fireEvent.change(email, { target: { value: 'test@example.com' } });
      fireEvent.submit(email.closest('form')!);
      expect(await screen.findByRole('alert')).toBeVisible();
      expect(sdk.capture).toHaveBeenLastCalledWith(
        'waitlist_form_error',
        expect.objectContaining({
          reason:
            status === 429
              ? 'rate_limited'
              : status >= 500
                ? 'server_error'
                : 'request_rejected',
        }),
      );
      expect(events()).not.toContain('waitlist_submitted');
      expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain(
        'private response',
      );
    },
  );

  it('captures native validation and network/timeout failures without raw text', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('secret body'));
    renderCta();
    flags();
    fireEvent.click(screen.getByRole('button', { name: 'Get launch updates' }));
    const email = screen.getByPlaceholderText('you@example.com');
    fireEvent.invalid(email);
    expect(sdk.capture).toHaveBeenLastCalledWith(
      'waitlist_form_error',
      expect.objectContaining({ reason: 'required_email' }),
    );
    fireEvent.change(email, { target: { value: 'bad-email' } });
    fireEvent.invalid(email);
    expect(sdk.capture).toHaveBeenLastCalledWith(
      'waitlist_form_error',
      expect.objectContaining({ reason: 'invalid_email' }),
    );
    fireEvent.change(email, { target: { value: 'test@example.com' } });
    fireEvent.submit(email.closest('form')!);
    await screen.findByRole('alert');
    expect(sdk.capture).toHaveBeenLastCalledWith(
      'waitlist_form_error',
      expect.objectContaining({ reason: 'network_or_timeout' }),
    );
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain('secret');
  });

  it('does not start an experiment or observe visibility when browser tracking is unavailable', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    vi.resetModules();
    ({ CtaExperiment } = await import('../landing-v2/CtaExperiment'));
    ({ AppCtaLink } = await import('../landing-v2/AppCtaLink'));
    vi.stubGlobal('IntersectionObserver', undefined);
    renderCta();
    expect(screen.getByRole('button', { name: 'Join waitlist' })).toBeVisible();
    expect(sdk.onFeatureFlags).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it('does not let analytics exceptions block a successful signup', async () => {
    sdk.capture.mockImplementation(() => {
      throw new Error('analytics down');
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ status: 'joined' }),
    );
    renderCta();
    flags();
    fireEvent.click(screen.getByRole('button', { name: 'Get launch updates' }));
    const email = screen.getByPlaceholderText('you@example.com');
    fireEvent.change(email, { target: { value: 'test@example.com' } });
    fireEvent.submit(email.closest('form')!);
    await waitFor(() =>
      expect(screen.getByText('You’re on the list ✓')).toBeVisible(),
    );
    sdk.capture.mockReset();
  });
});

describe('PostHog CTA assignment contract', () => {
  it.each([true, false, undefined, 'unexpected', 'control', 'value_first'])(
    'handles %s without creating a local random arm',
    (value) => {
      expect(resolveCtaVariant(value)).toBe(
        value === 'control' || value === 'value_first' ? value : 'baseline',
      );
    },
  );
  it('does not emit experiment properties without an exposure', () =>
    expect(ctaEventProperties(null)).toEqual({}));
  it('uses baseline when capture is opted out', () => {
    sdk.has_opted_out_capturing.mockReturnValue(true);
    const callback = vi.fn();
    subscribeCtaVariant(callback)();
    expect(callback).toHaveBeenCalledWith('baseline');
  });
  it('uses baseline when Do Not Track is enabled', () => {
    Object.defineProperty(window.navigator, 'doNotTrack', {
      value: '1',
      configurable: true,
    });
    const callback = vi.fn();
    subscribeCtaVariant(callback)();
    expect(callback).toHaveBeenCalledWith('baseline');
  });
});

it('prevents another submit while the first request is pending', async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  renderCta();
  flags();
  fireEvent.click(screen.getByRole('button', { name: 'Get launch updates' }));
  const email = screen.getByPlaceholderText('you@example.com');
  fireEvent.change(email, { target: { value: 'pending@example.com' } });
  fireEvent.submit(email.closest('form')!);
  fireEvent.submit(email.closest('form')!);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => resolve(Response.json({ status: 'joined' })));
  expect(screen.getByText('You’re on the list ✓')).toBeVisible();
});
