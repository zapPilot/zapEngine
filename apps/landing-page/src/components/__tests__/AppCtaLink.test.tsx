import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppCtaLink } from '@/components/landing-v2/AppCtaLink';
import { LINKS } from '@/config/links';

const { trackCtaClicked, trackWaitlistSubmitted } = vi.hoisted(() => ({
  trackCtaClicked: vi.fn(),
  trackWaitlistSubmitted: vi.fn(),
}));

vi.mock('@/lib/analytics/events', () => ({
  trackCtaClicked,
  trackWaitlistSubmitted,
}));

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  trackCtaClicked.mockClear();
  trackWaitlistSubmitted.mockClear();
});

describe('AppCtaLink', () => {
  it('opens the waitlist instead of exposing an app link', () => {
    render(
      <AppCtaLink className="zp-nav-cta" location="navbar">
        Join waitlist
      </AppCtaLink>,
    );

    expect(screen.queryByRole('link', { name: /app/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Join waitlist' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(trackCtaClicked).toHaveBeenCalledWith('navbar');
  });

  it('submits email and captured first-touch attribution to account-engine', async () => {
    window.history.replaceState(
      {},
      '',
      '/?utm_source=youtube&utm_medium=social&utm_campaign=72f1ee5b-3f57-4e32-b7ad-fe57666985d6&utm_content=en',
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);

    render(
      <AppCtaLink className="zp-btn" location="hero">
        Join waitlist
      </AppCtaLink>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join waitlist' }));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Join waitlist',
      }),
    );

    expect(await screen.findByText('You’re on the list ✓')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      LINKS.waitlistApi,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('72f1ee5b-3f57-4e32-b7ad-fe57666985d6'),
      }),
    );
    expect(trackWaitlistSubmitted).toHaveBeenCalledWith('hero', true);
  });
  it('preserves first touch across visits and retries a failed signup', async () => {
    window.history.replaceState({}, '', '/?utm_source=x&utm_medium=social');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);
    const first = render(
      <AppCtaLink className="cta" location="hero">
        Join waitlist
      </AppCtaLink>,
    );
    first.unmount();
    window.history.replaceState(
      {},
      '',
      '/?utm_source=youtube&utm_medium=social',
    );
    render(
      <AppCtaLink className="cta" location="hero">
        Join waitlist
      </AppCtaLink>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join waitlist' }));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'retry@example.com' },
    });
    const submit = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Join waitlist',
    });
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please try again',
    );
    expect(trackWaitlistSubmitted).not.toHaveBeenCalled();
    fireEvent.click(submit);
    expect(await screen.findByText('You’re on the list ✓')).toBeInTheDocument();
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({ utmSource: 'x' });
  });
  it('portals the modal outside transformed ancestors and restores keyboard focus', () => {
    render(
      <div style={{ transform: 'translateZ(0)' }}>
        <AppCtaLink className="cta" location="hero">
          Join waitlist
        </AppCtaLink>
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'Join waitlist' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    const close = within(dialog).getByRole('button', {
      name: 'Close waitlist',
    });
    const submit = within(dialog).getByRole('button', {
      name: 'Join waitlist',
    });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(submit).toHaveFocus();
    fireEvent.keyDown(submit, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
