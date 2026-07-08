import Image from 'next/image';

const VENUES = [
  {
    icon: '/protocols/ondo.webp',
    name: 'Ondo',
    tag: 'Tokenized S&P500',
    accent: true,
    body: 'The equity pillar the engine trades into when risk is rewarded.',
  },
  {
    icon: '/protocols/gmx-v2.webp',
    name: 'GMX v2',
    tag: 'BTC/ETH parking',
    accent: false,
    body: 'Where idle BTC/ETH can earn baseline yield while the regime stays risk-on.',
  },
  {
    icon: '/protocols/morpho.webp',
    name: 'Morpho',
    tag: 'Stablecoin parking',
    accent: false,
    body: 'Curated lending vaults where defensive stablecoins can park during risk-off regimes.',
  },
  {
    icon: '/protocols/hyperliquid.webp',
    name: 'Hyperliquid',
    tag: 'Stablecoin parking',
    accent: false,
    body: 'HLP delta-neutral market making — an alternative defensive parking venue.',
  },
];

export function YieldVenues() {
  return (
    <section className="zp-section" aria-label="Where yield fits">
      <div className="zp-container zp-venues-container">
        <p className="zp-kicker zp-kicker-muted">Where yield fits</p>
        <h2 className="zp-h2">Parking, between trades.</h2>
        <p className="zp-lede">
          Yield is the icing — not the strategy. Between regime signals, idle
          exposure can earn baseline yield in curated venues while the rules
          wait for the next trade. Venues are modular, never custody
          requirements.
        </p>
        <div className="zp-venues">
          {VENUES.map((venue) => (
            <div key={venue.name} className="zp-venue">
              <div className="zp-venue-head">
                <Image
                  src={venue.icon}
                  alt={venue.name}
                  width={26}
                  height={26}
                />
                <strong className="zp-venue-name">{venue.name}</strong>
              </div>
              <span
                className={
                  venue.accent
                    ? 'zp-venue-tag zp-venue-tag-accent'
                    : 'zp-venue-tag'
                }
              >
                {venue.tag}
              </span>
              <p className="zp-venue-body">{venue.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
