import type { Metadata } from 'next';
import './distribution.css';

const TITLE = 'Zap Pilot — Distribution engine';
const DESCRIPTION =
  'One long-form article becomes three localized scripts, three narrated tracks, three vertical videos, and a post on every platform we publish to — measured per channel.';
const PAGE_URL = 'https://zap-pilot.org/distribution';

/**
 * /distribution layout — route-local metadata plus `distribution.css`, so the
 * page's styling never ships with the home page bundle (same arrangement as
 * /pitch).
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://zap-pilot.org'),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  // An outreach artifact about the content pipeline, not the product. Keeping
  // it out of the index stops it competing with the home page on product SEO,
  // the same call /pitch makes.
  robots: { index: false, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: 'Zap Pilot',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function DistributionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
