import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppCtaLink } from '@/components/landing-v2/AppCtaLink';
import { LINKS } from '@/config/links';

const trackCtaClicked = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics/events', () => ({ trackCtaClicked }));

describe('AppCtaLink', () => {
  it('opens the app and reports which section was clicked', () => {
    render(
      <AppCtaLink className="zp-nav-cta" location="navbar">
        Launch App
      </AppCtaLink>,
    );

    const link = screen.getByRole('link', { name: 'Launch App' });
    expect(link).toHaveAttribute('href', LINKS.app);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    fireEvent.click(link);

    expect(trackCtaClicked).toHaveBeenCalledWith('navbar');
  });
});
