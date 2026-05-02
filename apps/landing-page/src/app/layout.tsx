import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { GoogleAnalytics } from '@next/third-parties/google';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Zap Pilot — Disciplined 3-Pillar Portfolio Autopilot',
  description:
    'Zap Pilot rebalances S&P500 (Ondo), BTC/ETH, and stablecoins by macro regime — buy in fear, defend in greed. 100% self-custody: we deliver the bundle, you sign it.',
  keywords:
    'tokenized S&P500, Ondo, BTC ETH allocation, stablecoin, regime trading, 200MA, Fear and Greed Index, self-custody, EOA wallet, EIP-7702, bundled transaction, rebalancing, backtested',
  authors: [{ name: 'Zap Pilot Team' }],
  openGraph: {
    title: 'Zap Pilot — Disciplined 3-Pillar Portfolio Autopilot',
    description:
      'Zap Pilot rebalances S&P500 (Ondo), BTC/ETH, and stablecoins by macro regime — buy in fear, defend in greed. 100% self-custody: we deliver the bundle, you sign it.',
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
    title: 'Zap Pilot — Disciplined 3-Pillar Portfolio Autopilot',
    description:
      'Zap Pilot rebalances S&P500 (Ondo), BTC/ETH, and stablecoins by macro regime — buy in fear, defend in greed. 100% self-custody: we deliver the bundle, you sign it.',
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
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
