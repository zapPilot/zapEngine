import type { Metadata } from 'next';
import { PITCH_META } from '@/config/pitch';
import './pitch.css';

/**
 * /pitch layout — sets pitch-specific metadata (title, OG, noindex) and
 * imports `pitch.css` so the chrome+slides styling only ships on this route,
 * not on the home page bundle.
 */
export const metadata: Metadata = {
  // metadataBase makes Next.js resolve the auto-detected /pitch/opengraph-image
  // into an absolute URL for social unfurl. Without it, the build emits a
  // localhost fallback warning and links unfurl with broken images.
  metadataBase: new URL('https://zap-pilot.org'),
  title: PITCH_META.title,
  description: PITCH_META.description,
  alternates: { canonical: PITCH_META.url },
  // 1:1 outreach artifact — don't compete with the home page on product SEO.
  robots: { index: false, follow: true },
  openGraph: {
    title: PITCH_META.title,
    description: PITCH_META.description,
    url: PITCH_META.url,
    siteName: 'Zap Pilot',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: PITCH_META.title,
    description: PITCH_META.description,
  },
};

export default function PitchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
