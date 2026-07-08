const STEPS = [
  {
    num: '01',
    tag: '200MA · FGI · ETH/BTC',
    title: 'Sense',
    body:
      'The 200-day moving average, Fear & Greed Index, and ETH/BTC ratio ' +
      'are watched continuously. Two macro signals, no discretion.',
    accent: false,
  },
  {
    num: '02',
    tag: 'Buy fear · defend greed',
    title: 'Decide',
    body:
      'Regime moves become a new target allocation across S&P500, BTC/ETH, ' +
      'and stables. The engine trades into the pillar the rules call for.',
    accent: false,
  },
  {
    num: '03',
    tag: 'Your wallet · EIP-7702',
    title: 'Sign',
    body:
      'The rebalance arrives as one pre-built plan. You review it and sign ' +
      'from your own wallet — atomic wallets sign one EIP-7702 bundle; ' +
      'others approve and execute sequentially. Your keys stay in control.',
    accent: true,
  },
];

export function HowItWorks() {
  return (
    <section className="zp-section" aria-label="How it works">
      <div className="zp-container">
        <p className="zp-kicker">How it works</p>
        <h2 className="zp-h2">Sense. Decide. Sign.</h2>
        <p className="zp-lede">
          Three steps between market data and your portfolio — the last one is
          always your signature.
        </p>
        <div className="zp-steps">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className={step.accent ? 'zp-step zp-step-accent' : 'zp-step'}
            >
              <div className="zp-step-head">
                <span className="zp-step-num">{step.num}</span>
                <span className="zp-step-tag">{step.tag}</span>
              </div>
              <h3 className="zp-step-title">{step.title}</h3>
              <p className="zp-step-body">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
