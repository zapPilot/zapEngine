import { GitBranch, Radar, Signature } from 'lucide-react';
import { MESSAGES } from '@/config/messages';

const STEP_ICONS = [Radar, GitBranch, Signature] as const;

export function HowItWorksV2() {
  return (
    <section className="v2-section how-it-works-v2" id="how-it-works">
      <div className="section-inner">
        <div className="section-kicker">How it works</div>
        <div className="section-heading-row">
          <div>
            <h2>{MESSAGES.howItWorksV2.title}</h2>
            <p>{MESSAGES.howItWorksV2.subtitle}</p>
          </div>
        </div>

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
      </div>
    </section>
  );
}
