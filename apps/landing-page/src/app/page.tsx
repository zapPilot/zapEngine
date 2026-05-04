import { BacktestProofV2 } from '@/components/v2/BacktestProofV2';
import { CTAV2 } from '@/components/v2/CTAV2';
import { FAQV2 } from '@/components/v2/FAQV2';
import { FooterV2 } from '@/components/v2/FooterV2';
import { HeroV2 } from '@/components/v2/HeroV2';
import { HowItWorksV2 } from '@/components/v2/HowItWorksV2';
import { NavbarV2 } from '@/components/v2/NavbarV2';
import { PillarsV2 } from '@/components/v2/PillarsV2';
import { ProtocolsV2 } from '@/components/v2/ProtocolsV2';
import { RegimeStripV2 } from '@/components/v2/RegimeStripV2';
import { TrustStripV2 } from '@/components/v2/TrustStripV2';
import { WhyItWorksV2 } from '@/components/v2/WhyItWorksV2';

export default function LandingPageV2() {
  return (
    <div className="v2-root">
      <NavbarV2 />
      <main>
        <HeroV2 />
        <RegimeStripV2 />
        <HowItWorksV2 />
        <PillarsV2 />
        <BacktestProofV2 />
        <WhyItWorksV2 />
        <FAQV2 />
        <ProtocolsV2 />
        <CTAV2 />
      </main>
      <TrustStripV2 />
      <FooterV2 />
    </div>
  );
}
