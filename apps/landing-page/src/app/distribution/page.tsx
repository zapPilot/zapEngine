import { DistributionChain } from '@/components/distribution/DistributionChain';
import { DistributionChannels } from '@/components/distribution/DistributionChannels';
import { DistributionExample } from '@/components/distribution/DistributionExample';
import { DistributionHero } from '@/components/distribution/DistributionHero';
import { DistributionLanguages } from '@/components/distribution/DistributionLanguages';
import { DistributionNav } from '@/components/distribution/DistributionNav';
import { DistributionReliability } from '@/components/distribution/DistributionReliability';
import { Footer } from '@/components/landing-v2/Footer';
import { getDistributionSnapshot } from '@/data/distribution';

/**
 * /distribution — what the content pipeline has actually produced.
 *
 * Every number comes from the committed snapshot in
 * `src/data/distribution-snapshot.json`, so the page is static and cannot go
 * blank because the database was slow. The visual weight is on the chain of
 * steps rather than on the reach figure: the claim being made is about the
 * system, and reach is the evidence that it is pointed at real audiences.
 */
export default function DistributionPage() {
  const snapshot = getDistributionSnapshot();

  return (
    <div className="zp-root dist-root">
      <DistributionNav />
      <main>
        <DistributionHero snapshot={snapshot} />
        <DistributionChain snapshot={snapshot} />
        <DistributionExample example={snapshot.example} />
        <DistributionChannels snapshot={snapshot} />
        <DistributionLanguages snapshot={snapshot} />
        <DistributionReliability snapshot={snapshot} />
      </main>
      <Footer />
    </div>
  );
}
