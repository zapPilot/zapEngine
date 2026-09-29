import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppCtaLink } from '@/components/landing-v2/AppCtaLink';

vi.mock('@/lib/waitlist-attribution', () => ({
  captureWaitlistFirstTouch: vi.fn(() => null),
  readWaitlistAttribution: vi.fn(() => null),
  firstTouchSuperProperties: vi.fn(() => ({})),
}));

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('AppCtaLink without attribution', () => {
  it('posts an empty attribution object', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);
    render(
      <AppCtaLink className="cta" location="hero">
        Join waitlist
      </AppCtaLink>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join waitlist' }));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'nullattr@example.com' },
    });
    fireEvent.submit(
      screen.getByPlaceholderText('you@example.com').closest('form')!,
    );
    expect(await screen.findByText('You’re on the list ✓')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});
