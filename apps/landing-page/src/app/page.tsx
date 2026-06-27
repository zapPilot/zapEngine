import { ArrowRight } from 'lucide-react';
import { BacktestProof } from '@/components/landing/BacktestProof';
import { CTA } from '@/components/landing/CTA';
import { FAQ } from '@/components/landing/FAQ';
import { Footer } from '@/components/landing/Footer';
import { Hero } from '@/components/landing/Hero';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Navbar } from '@/components/landing/Navbar';
import { Pillars } from '@/components/landing/Pillars';
import { Protocols } from '@/components/landing/Protocols';
import { RegimeStrip } from '@/components/landing/RegimeStrip';
import { TrustStrip } from '@/components/landing/TrustStrip';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="shell-root">
      <Navbar />
      <main>
        <Hero />
        <RegimeStrip />
        <HowItWorks />
        <Pillars />
        <BacktestProof />
        <section className="live-track-cta" aria-label="Live track record">
          <div className="live-track-cta-inner">
            <div>
              <p className="live-track-kicker">Live track record</p>
              <h2 className="live-track-title">
                Verified on-chain. Every day.
              </h2>
              <p className="live-track-sub">
                Daily snapshots of wallet positions, NAV, and performance are
                cryptographically signed and pinned to IPFS. The full chain is
                publicly verifiable.
              </p>
            </div>
            <Link className="live-track-btn" href="/track-record">
              View live track record
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>
        <FAQ />
        <Protocols />
        <CTA />
      </main>
      <TrustStrip />
      <Footer />
    </div>
  );
}
