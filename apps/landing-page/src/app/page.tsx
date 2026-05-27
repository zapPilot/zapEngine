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
        <FAQ />
        <Protocols />
        <CTA />
      </main>
      <TrustStrip />
      <Footer />
    </div>
  );
}
