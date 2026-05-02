const PILLARS = [
  {
    color: 'spy',
    name: 'S&P 500',
    tag: 'ONDO · EQUITY PILLAR',
    stat: '42%',
    body: "Tokenized U.S. equity exposure gives the allocator a traditional risk-on anchor without leaving your wallet's control surface.",
  },
  {
    color: 'btc',
    name: 'BTC · ETH',
    tag: 'CRYPTO · BETA PILLAR',
    stat: '38%',
    body: 'Digital asset beta rotates with regime strength, adding ETH/BTC relative strength as the overlay for crypto allocation.',
  },
  {
    color: 'usd',
    name: 'USDC',
    tag: 'STABLE · DEFENSE PILLAR',
    stat: '20%',
    body: 'Stablecoin parking absorbs greed and drawdown risk while idle capital keeps earning baseline venue yield.',
  },
] as const;

export function PillarsV2() {
  return (
    <section
      className="v2-section pillars-deep"
      aria-labelledby="pillars-title"
    >
      <div className="section-inner">
        <div className="section-kicker">Three-pillar allocator</div>
        <h2 id="pillars-title">A disciplined balance sheet in motion.</h2>
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
      </div>
    </section>
  );
}
