import type { Metadata } from 'next';
import { Geist, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { GoogleAnalytics } from '@next/third-parties/google';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';
import './landing.css';
import './landing-v2.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
});

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const SITE_DESCRIPTION =
  'A self-custodial investment autopilot: your net worth, three-pillar allocation, and regime-aware rebalancing — every trade signed from your own wallet, held by no one else.';

export const metadata: Metadata = {
  metadataBase: new URL('https://zap-pilot.org'),
  title: 'Zap Pilot — Your Net Worth, on Autopilot',
  description: SITE_DESCRIPTION,
  keywords:
    'self-custodial robo-advisor, investment autopilot, net worth, tokenized S&P500, Ondo, BTC ETH allocation, stablecoin, regime trading, 200MA, Fear and Greed Index, self-custody, EOA wallet, EIP-7702, bundled transaction, rebalancing, backtested',
  authors: [{ name: 'Zap Pilot Team' }],
  openGraph: {
    title: 'Zap Pilot — Your Net Worth, on Autopilot',
    description: SITE_DESCRIPTION,
    url: 'https://zap-pilot.org',
    siteName: 'Zap Pilot',
    images: [
      {
        url: '/zap-pilot-logo.svg',
        width: 1200,
        height: 630,
        alt: 'Zap Pilot Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zap Pilot — Your Net Worth, on Autopilot',
    description: SITE_DESCRIPTION,
    images: ['/zap-pilot-logo.svg'],
  },
  icons: {
    icon: '/zap-pilot-icon.svg',
    shortcut: '/zap-pilot-icon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${instrumentSerif.variable} ${jetBrainsMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <RootProvider
          search={{
            options: {
              // Static search: read prebuilt index from /api/search/static.json
              // (generated at build time by app/api/search/static.json/route.ts).
              // Compatible with `output: 'export'` — no runtime API call is made.
              type: 'static',
              api: '/api/search/static.json',
            },
          }}
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </RootProvider>
        {process.env['NEXT_PUBLIC_GA_ID'] && (
          <GoogleAnalytics gaId={process.env['NEXT_PUBLIC_GA_ID']} />
        )}
      </body>
    </html>
  );
}
