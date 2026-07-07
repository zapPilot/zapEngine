import { ALLOCATION_PILLARS } from '@/config/allocation';
import { AllocationBar } from '@/components/primitives/AllocationBar';
import { Section } from '@/components/primitives/Section';

const PILLAR_DETAILS: Record<
  (typeof ALLOCATION_PILLARS)[number]['key'],
  string
> = {
  spy: "Tokenized U.S. equity exposure gives your account a traditional risk-on anchor without leaving your wallet's control surface.",
  btc: 'Digital asset beta is added when the regime rewards risk, with ETH/BTC relative strength deciding the inner crypto rotation.',
  usd: 'Stablecoins become the active destination when the rules defend capital. Yield can accrue there, but the trade is the point.',
};

export function Pillars() {
  return (
    <Section
      id="strategy"
      className="pillars-deep"
      ariaLabelledBy="pillars-title"
      kicker="Three-pillar account"
    >
      <h2 id="pillars-title">What your account holds.</h2>
      <p className="pillar-disclaimer">
        Example regime-based allocation. Actual weights shift with the live
        regime.
      </p>
      <AllocationBar
        className="pillar-alloc"
        height={10}
        ariaLabel="Example allocation across the three pillars"
        segments={ALLOCATION_PILLARS.map((pillar) => ({
          color: `var(--${pillar.key})`,
          value: pillar.weight,
        }))}
      />
      <div className="pillar-card-grid">
        {ALLOCATION_PILLARS.map((pillar) => (
          <article className="pillar-card" key={pillar.key}>
            <div className={`pillar-dot ${pillar.key}`} aria-hidden />
            <p className="pillar-tag">{pillar.tag.toUpperCase()}</p>
            <h3>{pillar.label}</h3>
            <div className="brushed-stat">{pillar.weight}%</div>
            <p>{PILLAR_DETAILS[pillar.key]}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}
