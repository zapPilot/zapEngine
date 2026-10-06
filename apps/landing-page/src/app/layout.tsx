import type { Metadata } from 'next';
import { Geist, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { GoogleAnalytics } from '@next/third-parties/google';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MESSAGES } from '@/config/messages';
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

const { meta } = MESSAGES;

export const metadata: Metadata = {
  metadataBase: new URL('https://zap-pilot.org'),
  title: meta.title,
  description: meta.description,
  keywords: meta.keywords,
  authors: [{ name: 'Zap Pilot Team' }],
  openGraph: {
    title: meta.title,
    description: meta.description,
    url: 'https://zap-pilot.org',
    siteName: MESSAGES.common.brandName,
    images: [
      {
        url: '/zap-pilot-logo.svg',
        width: 1200,
        height: 630,
        alt: meta.imageAlt,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: meta.title,
    description: meta.description,
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
