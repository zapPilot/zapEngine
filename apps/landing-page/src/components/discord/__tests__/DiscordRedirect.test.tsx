import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordRedirect } from '../DiscordRedirect';
import { trackDiscordCtaClicked } from '@/lib/analytics/events';
vi.mock('@/lib/analytics/events', () => ({ trackDiscordCtaClicked: vi.fn() }));
const originalLocation = window.location;
const replace = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, replace },
    writable: true,
  });
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
  });
});
describe('Discord redirect', () => {
  it('shows a fallback before redirecting and sends beacon first', () => {
    render(<DiscordRedirect />);
    expect(
      screen.getByRole('link', { name: 'Continue to Discord' }),
    ).toHaveAttribute('href', 'https://discord.gg/d3vXUtcFCJ');
    expect(replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(600));
    expect(trackDiscordCtaClicked).toHaveBeenCalledExactlyOnceWith(
      'redirect',
      false,
      { beacon: true },
    );
    expect(replace).toHaveBeenCalledWith('https://discord.gg/d3vXUtcFCJ');
    expect(
      vi.mocked(trackDiscordCtaClicked).mock.invocationCallOrder[0],
    ).toBeLessThan(replace.mock.invocationCallOrder[0]!);
  });
  it('cancels the timer on unmount', () => {
    const { unmount } = render(<DiscordRedirect />);
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(replace).not.toHaveBeenCalled();
    expect(trackDiscordCtaClicked).not.toHaveBeenCalled();
  });
});
