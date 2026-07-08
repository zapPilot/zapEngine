import Image from 'next/image';

const GUARANTEES = [
  {
    title: 'Wallet-signed bundles.',
    body: 'The full plan — routes, venues, gas — is previewed in your wallet before anything moves.',
  },
  {
    title: 'EIP-7702 atomic where supported.',
    body: 'One signature, one all-or-nothing bundle. No partial states.',
  },
  {
    title: 'Sequential fallback.',
    body: 'Wallets without 7702 approve and execute step by step — each transaction still yours.',
  },
  {
    title: 'Skip freely.',
    body: 'Miss a window and nothing moves. The engine keeps watching; your allocation waits for you.',
  },
];

const BUNDLE_STEPS = [
  {
    icon: '/btc.webp',
    label: 'Sell 0.021 WBTC',
    amount: '\u2212$2,040',
    positive: false,
  },
  {
    icon: '/eth.webp',
    label: 'Sell 0.58 ETH',
    amount: '\u2212$2,105',
    positive: false,
  },
  {
    icon: '/usdc.webp',
    label: 'Buy 4,145 USDC',
    amount: '+$4,145',
    positive: true,
  },
];

export function TrustBoundary() {
  return (
    <section
      id="trust"
      className="zp-section zp-section-alt"
      aria-label="Execution trust boundary"
    >
      <div className="zp-container zp-trust">
        <div>
          <p className="zp-kicker">Execution trust boundary</p>
          <h2 className="zp-h2">
            The engine proposes.
            <br />
            Only you execute.
          </h2>
          <p className="zp-lede">
            Zap Pilot never holds keys, never custodies assets, and never
            carries standing approvals. Every rebalance is a pre-built,
            reviewable bundle that is inert until your wallet signs it.
          </p>
          <ul className="zp-trust-list">
            {GUARANTEES.map((item) => (
              <li key={item.title}>
                <span className="zp-mark" aria-hidden>
                  ◆
                </span>
                <span>
                  <strong>{item.title}</strong> <span>{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="zp-bundle">
          <p className="zp-bundle-kicker">Rebalance bundle · review</p>
          <div className="zp-bundle-rows">
            {BUNDLE_STEPS.map((step) => (
              <div key={step.label} className="zp-bundle-row">
                <span className="zp-bundle-asset">
                  <Image src={step.icon} alt="" width={20} height={20} />
                  {step.label}
                </span>
                <span
                  className={
                    step.positive
                      ? 'zp-bundle-amount zp-bundle-amount-good'
                      : 'zp-bundle-amount'
                  }
                >
                  {step.amount}
                </span>
              </div>
            ))}
          </div>
          <div className="zp-bundle-meta">
            <span>Gas · previewed in wallet</span>
            <span>Atomic · EIP-7702</span>
          </div>
          <div className="zp-bundle-sign">Sign from your wallet</div>
          <p className="zp-bundle-footnote">No signature · no movement</p>
        </div>
      </div>
    </section>
  );
}
