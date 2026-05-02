import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { HowItWorks } from '@/components/HowItWorks';
import { Features } from '@/components/Features';
import { BacktestProof } from '@/components/BacktestProof';
import { Protocols } from '@/components/Protocols';
import { CTA } from '@/components/CTA';
import { Footer } from '@/components/Footer';
import { AnimatedBackground } from '@/components/AnimatedBackground';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-x-hidden">
      <AnimatedBackground />

      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      <BacktestProof />
      <Protocols />
      <CTA />
      <Footer />
    </div>
  );
}
