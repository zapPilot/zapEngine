import { GitBranch, Radar, Signature } from 'lucide-react';
import { MESSAGES } from '@/config/messages';
import { Section } from '@/components/primitives/Section';

const STEP_ICONS = [Radar, GitBranch, Signature] as const;

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      className="how-it-works"
      kicker="How it works"
      title={MESSAGES.howItWorks.title}
      subtitle={MESSAGES.howItWorks.subtitle}
    >
      <div className="how-step-grid">
        {MESSAGES.howItWorks.steps.map((step, index) => {
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
