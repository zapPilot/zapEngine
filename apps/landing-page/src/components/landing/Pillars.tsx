import { Section } from '@/components/primitives/Section';

const PILLARS = [
  {
    color: 'spy',
    name: 'S&P 500',
    tag: 'TRADE INTO EQUITIES',
    stat: '42%',
    body: "Tokenized U.S. equity exposure gives the allocator a traditional risk-on anchor without leaving your wallet's control surface.",
  },
  {
    color: 'btc',
    name: 'BTC · ETH',
    tag: 'TRADE INTO CRYPTO BETA',
    stat: '38%',
    body: 'Digital asset beta is added when the regime rewards risk, with ETH/BTC relative strength deciding the inner crypto rotation.',
  },
  {
    color: 'usd',
    name: 'USDC',
    tag: 'TRADE INTO DEFENSE',
    stat: '20%',
    body: 'Stablecoins become the active destination when the rules defend capital. Yield can accrue there, but the trade is the point.',
  },
] as const;

export function Pillars() {
  return (
    <Section
      className="pillars-deep"
      ariaLabelledBy="pillars-title"
      kicker="Three-pillar allocator"
    >
      <h2 id="pillars-title">What the engine trades into.</h2>
      <p className="pillar-disclaimer">
        Example regime-based allocation. Actual weights shift with the live
        regime.
      </p>
      <div className="pillar-card-grid">
        {PILLARS.map((pillar) => (
          <article className="pillar-card" key={pillar.name}>
            <div className={`pillar-dot ${pillar.color}`} aria-hidden />
            <p className="pillar-tag">{pillar.tag}</p>
            <h3>{pillar.name}</h3>
            <div className="brushed-stat">{pillar.stat}</div>
            <p>{pillar.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}
