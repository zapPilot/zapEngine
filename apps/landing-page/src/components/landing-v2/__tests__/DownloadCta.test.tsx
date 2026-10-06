import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadCta } from '../DownloadCta';
const availability = vi.hoisted(() => ({
  mac: true,
  appStore: true,
  googlePlay: true,
}));
vi.mock('@/config/links', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/links')>()),
  DOWNLOAD_AVAILABILITY: availability,
}));
vi.mock('@/lib/analytics/events', () => ({
  trackDownloadCtaClicked: vi.fn(),
  trackCtaClicked: vi.fn(),
}));
vi.mock('../AppCtaLink', () => ({
  AppCtaLink: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className: string;
  }) => <button className={className}>{children}</button>,
}));
import { trackDownloadCtaClicked } from '@/lib/analytics/events';
afterEach(() => {
  availability.mac = true;
  availability.googlePlay = true;
  availability.appStore = true;
});
it.each([
  ['Macintosh', 'Download for Mac'],
  ['iPhone', 'Download on the App Store'],
  ['Android', 'Get it on Google Play'],
])('offers %s download and analytics', (ua, label) => {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: ua,
  });
  render(<DownloadCta />);
  const primary = screen.getAllByRole('link', { name: new RegExp(label) })[0]!;
  expect(primary.className).toContain('zp-btn-primary');
  fireEvent.click(primary);
  expect(trackDownloadCtaClicked).toHaveBeenCalledWith(
    expect.objectContaining({ location: 'hero' }),
  );
  if (ua === 'Macintosh')
    expect(primary.getAttribute('href')).toBe(
      'https://github.com/zapPilot/zapEngine/releases/latest/download/Zap-Pilot-mac-arm64.dmg',
    );
});
it('keeps unavailable platforms on waitlist with the available fallback row', () => {
  availability.mac = false;
  availability.googlePlay = false;
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Macintosh',
  });
  render(<DownloadCta />);
  expect(screen.getByRole('button').className).toContain('zp-btn-primary');
  expect(screen.queryByRole('link', { name: /Download for Mac/ })).toBeNull();
  expect(screen.getByRole('link', { name: /App Store/ })).toBeTruthy();
});
it('omits fallback when no downloads exist', () => {
  availability.mac = false;
  availability.googlePlay = false;
  availability.appStore = false;
  render(<DownloadCta />);
  expect(screen.queryAllByRole('link')).toHaveLength(0);
});

it('renders the neutral server snapshot', async () => {
  const { renderToString } = await import('react-dom/server');
  expect(renderToString(<DownloadCta />)).toContain('All available downloads');
});
