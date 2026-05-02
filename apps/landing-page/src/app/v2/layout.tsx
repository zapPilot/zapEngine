import type { Metadata } from 'next';
import { Instrument_Serif, JetBrains_Mono } from 'next/font/google';
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
};

export default function V2Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${instrumentSerif.variable} ${jetBrainsMono.variable}`}>
      {children}
    </div>
  );
}
