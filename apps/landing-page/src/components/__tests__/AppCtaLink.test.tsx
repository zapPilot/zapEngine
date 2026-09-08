import { fireEvent, render, screen } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button', { name: 'Join waitlist' }));

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
});
