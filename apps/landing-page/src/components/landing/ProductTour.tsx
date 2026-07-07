import { ArrowDownToLine, Send } from 'lucide-react';
import { ALLOCATION_PILLARS } from '@/config/allocation';
import { AllocationBar } from '@/components/primitives/AllocationBar';
import { Section } from '@/components/primitives/Section';
import { Sparkline } from '@/components/primitives/Sparkline';
import { MESSAGES } from '@/config/messages';

/**
 * ProductTour — miniature, stylized recreations of the app's Home,
 * Portfolio, and Invest screens, built from the same primitives
 * (Sparkline, AllocationBar) and tokens the app uses. The landing page
 * shows the account, not just the engine.
 */

const TOUR_SPARKLINE = [100, 102.1, 101.4, 104.2, 103.5, 106.8, 105.9, 109.1];

const PORTFOLIO_METRICS = [
  { label: 'Strategy ROI', value: '+18.4%' },
  { label: 'Sharpe', value: '1.12' },
  { label: 'Max DD', value: '-9.8%' },
  { label: 'Rebalances', value: '14' },
] as const;

const INVEST_STEPS = ['Amount', 'Route', 'Confirm', 'Sign'] as const;

export function ProductTour() {
  const [home, portfolio, invest] = MESSAGES.productTour.frames;

  return (
    <Section
      id="product"
      className="product-tour"
      ariaLabelledBy="product-tour-title"
      kicker={MESSAGES.productTour.kicker}
      title={MESSAGES.productTour.title}
      subtitle={MESSAGES.productTour.subtitle}
    >
      <div className="tour-grid">
        <article className="tour-frame">
          <div className="tour-frame-ui" aria-hidden>
            <p className="tour-ui-kicker">Net worth</p>
            <p className="tour-ui-value">
              $128,540<span>.22</span>
            </p>
            <div className="tour-ui-spark">
              <Sparkline
                data={TOUR_SPARKLINE}
                height={44}
                gradientId="tour-home-spark"
              />
            </div>
            <div className="tour-ui-actions">
              <span className="tour-ui-action">
                <ArrowDownToLine aria-hidden />
                Invest
              </span>
              <span className="tour-ui-action">
                <Send aria-hidden />
                Send
              </span>
            </div>
          </div>
          <p className="tour-kicker">{home.kicker}</p>
          <h3>{home.headline}</h3>
          <p className="tour-desc">{home.description}</p>
        </article>

        <article className="tour-frame">
          <div className="tour-frame-ui" aria-hidden>
            <p className="tour-ui-kicker">Portfolio</p>
            <div className="tour-ui-metrics">
              {PORTFOLIO_METRICS.map((metric) => (
                <div className="tour-ui-metric" key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
            <AllocationBar
              className="tour-ui-alloc"
              segments={ALLOCATION_PILLARS.map((pillar) => ({
                color: `var(--${pillar.key})`,
                value: pillar.weight,
              }))}
            />
          </div>
          <p className="tour-kicker">{portfolio.kicker}</p>
          <h3>{portfolio.headline}</h3>
          <p className="tour-desc">{portfolio.description}</p>
        </article>

        <article className="tour-frame">
          <div className="tour-frame-ui" aria-hidden>
            <p className="tour-ui-kicker">Invest wizard</p>
            <ol className="tour-ui-steps">
              {INVEST_STEPS.map((step, index) => (
                <li
                  key={step}
                  className={
                    index === INVEST_STEPS.length - 1 ? 'active' : undefined
                  }
                >
                  <span className="tour-ui-step-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <span className="tour-ui-sign">One signature · your wallet</span>
          </div>
          <p className="tour-kicker">{invest.kicker}</p>
          <h3>{invest.headline}</h3>
          <p className="tour-desc">{invest.description}</p>
        </article>
      </div>
    </Section>
  );
}
