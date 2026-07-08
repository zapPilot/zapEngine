import { LINKS } from '@/config/links';
import { HeroCockpit } from './HeroCockpit';

const HERO_CHIPS = ['No custody', 'No discretion', 'No standing approvals'];

export function Hero() {
  return (
    <section className="zp-hero" aria-label="Overview">
      <div>
        <div className="zp-eyebrow">
          <span className="zp-dot" aria-hidden />
          Self-custodial investment autopilot
        </div>
        <h1 className="zp-hero-title">
          Your net worth,
          <br />
          on autopilot.
        </h1>
        <p className="zp-hero-sub">
          One account across S&amp;P500, BTC/ETH, and stables. Watch your net
          worth, allocation, and every rebalance — signed from your wallet, held
          by no one else.
        </p>
        <div className="zp-hero-chips">
          {HERO_CHIPS.map((chip) => (
            <span key={chip} className="zp-chip">
              {chip}
            </span>
          ))}
        </div>
        <div className="zp-hero-ctas" aria-label="Primary actions">
          <a
            className="zp-btn zp-btn-primary"
            href={LINKS.app}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the app <span aria-hidden>→</span>
          </a>
          <a className="zp-btn zp-btn-ghost" href="#proof">
            See the backtest
          </a>
        </div>
      </div>
      <HeroCockpit />
    </section>
  );
}
