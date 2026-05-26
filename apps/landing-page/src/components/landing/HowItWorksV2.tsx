import { GitBranch, Radar, Signature } from 'lucide-react';
import { MESSAGES } from '@/config/messages';
import { Section } from './primitives/Section';

const STEP_ICONS = [Radar, GitBranch, Signature] as const;

export function HowItWorksV2() {
  return (
    <Section
      id="how-it-works"
      className="how-it-works-v2"
      kicker="How it works"
      title={MESSAGES.howItWorksV2.title}
      subtitle={MESSAGES.howItWorksV2.subtitle}
    >
      <div className="how-step-grid">
        {MESSAGES.howItWorksV2.steps.map((step, index) => {
          const Icon = STEP_ICONS[index] ?? Radar;

          return (
            <article className="how-step" key={step.title}>
              <div className="how-step-index">
                <Icon aria-hidden />
                <span>{String(index + 1).padStart(2, '0')}</span>
              </div>
              <p className="how-step-meta">{step.meta}</p>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
