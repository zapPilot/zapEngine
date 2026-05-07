import { MESSAGES } from '@/config/messages';
import { Section } from './primitives/Section';

export function WhyItWorksV2() {
  return (
    <Section
      id="why-it-works"
      className="why-it-works-v2"
      kicker="Why it works"
      title={MESSAGES.whyItWorks.title}
      subtitle={MESSAGES.whyItWorks.subtitle}
    >
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
    </Section>
  );
}
