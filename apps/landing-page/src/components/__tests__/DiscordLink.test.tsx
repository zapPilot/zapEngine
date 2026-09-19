import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiscordLink } from '../landing-v2/DiscordLink';
import { trackDiscordCtaClicked } from '@/lib/analytics/events';
vi.mock('@/lib/analytics/events', () => ({ trackDiscordCtaClicked: vi.fn() }));

describe('DiscordLink', () => {
  it.each([
    ['footer', false],
    ['waitlist_success', true],
  ] as const)('tracks %s intent', (location, postWaitlist) => {
    render(
      <DiscordLink location={location} postWaitlist={postWaitlist}>
        Community
      </DiscordLink>,
    );
    const link = screen.getByRole('link', { name: 'Community' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(link);
    expect(trackDiscordCtaClicked).toHaveBeenLastCalledWith(
      location,
      postWaitlist,
    );
  });
});
