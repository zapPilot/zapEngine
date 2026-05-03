import { ArrowRight } from 'lucide-react';
import { MESSAGES } from '@/config/messages';

export function BacktestProofV2() {
  return (
    <section className="v2-section backtest-proof" id="proof">
      <div className="section-inner">
        <div className="section-kicker">Backtest proof</div>
        <div className="section-heading-row">
          <div>
            <h2>{MESSAGES.backtest.title}</h2>
            <p>{MESSAGES.backtest.subtitle}</p>
          </div>
          <a className="method-link" href={MESSAGES.backtest.ctaLink}>
            {MESSAGES.backtest.ctaText}
            <ArrowRight aria-hidden />
          </a>
        </div>

        <div className="backtest-grid">
          {MESSAGES.backtest.stats.map((stat) => (
            <article className="backtest-stat" key={stat.label}>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.sublabel}</span>
            </article>
          ))}
        </div>

        <div className="comparison-row" aria-label="Strategy versus DCA">
          {MESSAGES.backtest.comparison.map((item) => (
            <div className="comparison-item" key={item.label}>
              <strong>{item.label}</strong>
              <span>ROI {item.roi}</span>
              <span>Max DD {item.maxDrawdown}</span>
              <span>{item.trades} trades</span>
            </div>
          ))}
        </div>

        <p className="proof-disclaimer">{MESSAGES.backtest.disclaimer}</p>
      </div>
    </section>
  );
}
