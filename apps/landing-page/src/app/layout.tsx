import { BRAND_NAME } from '@zapengine/zap-pilot-story/brand';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { GoogleAnalytics } from '@next/third-parties/google';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MESSAGES } from '@/config/messages';
import './globals.css';
import '@zapengine/zap-pilot-story/styles.css';

const archivo = localFont({
  src: '../../node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2',
  variable: '--font-archivo',
  weight: '100 900',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});
const martian = localFont({
  src: '../../node_modules/@fontsource-variable/martian-mono/files/martian-mono-latin-standard-normal.woff2',
  variable: '--font-martian',
  weight: '100 800',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '75% 112.5%' }],
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
    siteName: BRAND_NAME,
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: meta.title,
    description: meta.description,
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
        className={`${archivo.variable} ${martian.variable} antialiased flex flex-col min-h-screen`}
      >
        <ErrorBoundary>{children}</ErrorBoundary>
        {process.env['NEXT_PUBLIC_GA_ID'] && (
          <GoogleAnalytics gaId={process.env['NEXT_PUBLIC_GA_ID']} />
        )}
      </body>
    </html>
  );
}
