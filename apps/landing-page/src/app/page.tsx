import { BacktestProof } from '@/components/landing-v2/BacktestProof';
import { BehaviorReplacement } from '@/components/landing-v2/BehaviorReplacement';
import { ClosingCta } from '@/components/landing-v2/ClosingCta';
import { Footer } from '@/components/landing-v2/Footer';
import { Hero } from '@/components/landing-v2/Hero';
import { HowItWorks } from '@/components/landing-v2/HowItWorks';
import { Navbar } from '@/components/landing-v2/Navbar';
import { TrustBoundary } from '@/components/landing-v2/TrustBoundary';
import { YieldVenues } from '@/components/landing-v2/YieldVenues';

export default function LandingPage() {
  return (
    <div className="zp-root">
      <Navbar />
      <main>
        <Hero />
        <BehaviorReplacement />
        <HowItWorks />
        <BacktestProof />
        <YieldVenues />
        <TrustBoundary />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}
