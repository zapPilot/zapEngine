import { MESSAGES } from '@/config/messages';

export function WhyItWorksV2() {
  return (
    <section className="v2-section why-it-works-v2" id="why-it-works">
      <div className="section-inner">
        <div className="section-kicker">Why it works</div>
        <div className="section-heading-row">
          <div>
            <h2>{MESSAGES.whyItWorks.title}</h2>
            <p>{MESSAGES.whyItWorks.subtitle}</p>
          </div>
        </div>

        <div className="attribution-table" role="table">
          <div className="attribution-row attribution-head" role="row">
            <span role="columnheader">Feature</span>
            <span role="columnheader">If removed</span>
            <span role="columnheader">What it does</span>
          </div>
          {MESSAGES.whyItWorks.items.map((item) => (
            <div className="attribution-row" role="row" key={item.feature}>
              <strong role="cell">{item.feature}</strong>
              <em role="cell">{item.impact}</em>
              <p role="cell">{item.description}</p>
            </div>
          ))}
        </div>

        <p className="proof-disclaimer">{MESSAGES.whyItWorks.source}</p>
      </div>
    </section>
  );
}
