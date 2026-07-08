const REFLEX_ITEMS = [
  'Buys after the rally, because greed feels safe',
  'Sells the drawdown, because fear feels urgent',
  'Trades constantly — noise dressed up as strategy',
];

const RULE_ITEMS = [
  'Buys weakness when fear is measurable, not felt',
  'Rotates to defense when greed stretches the regime',
  '53 trades in 500 days — every one of them yours to sign',
];

export function BehaviorReplacement() {
  return (
    <section
      id="strategy"
      className="zp-section zp-section-alt"
      aria-label="The behavior it replaces"
    >
      <div className="zp-container">
        <p className="zp-kicker">The behavior it replaces</p>
        <h2 className="zp-h2">Buy in fear. Defend in greed.</h2>
        <p className="zp-lede">
          Most portfolios lose to emotion, not markets — buying tops, selling
          bottoms, chasing whatever moved yesterday. Zap Pilot codifies the
          opposite reflex and holds you to it.
        </p>
        <div className="zp-compare-grid">
          <div className="zp-card">
            <p className="zp-card-kicker">The reflex</p>
            <ul className="zp-checklist">
              {REFLEX_ITEMS.map((item) => (
                <li key={item}>
                  <span className="zp-mark zp-mark-bad" aria-hidden>
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="zp-card zp-card-accent">
            <p className="zp-card-kicker zp-card-kicker-accent">The rule</p>
            <ul className="zp-checklist zp-checklist-strong">
              {RULE_ITEMS.map((item) => (
                <li key={item}>
                  <span className="zp-mark zp-mark-good" aria-hidden>
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
