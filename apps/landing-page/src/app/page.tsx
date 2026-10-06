import { Adapters } from '@/components/landing-v2/Adapters';
import { BacktestProof } from '@/components/landing-v2/BacktestProof';
import { ClosingCta } from '@/components/landing-v2/ClosingCta';
import { Footer } from '@/components/landing-v2/Footer';
import { Hero } from '@/components/landing-v2/Hero';
import { Navbar } from '@/components/landing-v2/Navbar';
import { Ownership } from '@/components/landing-v2/Ownership';
import { Runtime } from '@/components/landing-v2/Runtime';
import { Strategies } from '@/components/landing-v2/Strategies';
import { TrustBoundary } from '@/components/landing-v2/TrustBoundary';

export default function LandingPage() {
  return (
    <div className="zp-root">
      <Navbar />
      <main>
        <Hero />
        <Ownership />
        <Runtime />
        <Strategies />
        <BacktestProof />
        <Adapters />
        <TrustBoundary />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}
