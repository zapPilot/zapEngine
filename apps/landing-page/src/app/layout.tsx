import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { GoogleAnalytics } from '@next/third-parties/google';
import { RootProvider } from 'fumadocs-ui/provider/next';
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
  title: 'Zap Pilot - Landing Page',
  description:
    'Zap Pilot is a DeFi intent-based execution engine that transforms user intent into automated, cross-chain investment actions — all in one click, with funds always staying in their own wallet.',
  keywords:
    'DeFi, intent-based execution, cross-chain, cryptocurrency, blockchain, yield farming, vault strategies',
  authors: [{ name: 'Zap Pilot Team' }],
  openGraph: {
    title: 'Zap Pilot - Landing Page',
    description:
      'Transform your investment intent into automated, cross-chain actions — all in one click.',
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
    title: 'Zap Pilot - Landing Page',
    description:
      'Transform your investment intent into automated, cross-chain actions — all in one click.',
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
        <RootProvider>{children}</RootProvider>
        {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
      </body>
    </html>
  );
}
