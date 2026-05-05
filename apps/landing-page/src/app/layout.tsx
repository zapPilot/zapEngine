import type { Metadata } from 'next';
import { Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { GoogleAnalytics } from '@next/third-parties/google';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';
import './v2.css';

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

export const metadata: Metadata = {
  title: 'Zap Pilot v2 — Liquid Metal Allocator',
  description:
    'A liquid-metal edition of Zap Pilot: three pillars, one wallet, regime-aware rebalancing, and 100% self-custody.',
  keywords:
    'tokenized S&P500, Ondo, BTC ETH allocation, stablecoin, regime trading, 200MA, Fear and Greed Index, self-custody, EOA wallet, EIP-7702, bundled transaction, rebalancing, backtested',
  authors: [{ name: 'Zap Pilot Team' }],
  openGraph: {
    title: 'Zap Pilot v2 — Liquid Metal Allocator',
    description:
      'A liquid-metal edition of Zap Pilot: three pillars, one wallet, regime-aware rebalancing, and 100% self-custody.',
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
    title: 'Zap Pilot v2 — Liquid Metal Allocator',
    description:
      'A liquid-metal edition of Zap Pilot: three pillars, one wallet, regime-aware rebalancing, and 100% self-custody.',
    images: ['/zap-pilot-logo.svg'],
  },
  icons: {
    icon: '/zap-pilot-icon.svg',
    shortcut: '/zap-pilot-icon.svg',
    apple: '/zap-pilot-icon.svg',
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
        className={`${instrumentSerif.variable} ${jetBrainsMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <RootProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
        </RootProvider>
        {process.env['NEXT_PUBLIC_GA_ID'] && (
          <GoogleAnalytics gaId={process.env['NEXT_PUBLIC_GA_ID']} />
        )}
      </body>
    </html>
  );
}
