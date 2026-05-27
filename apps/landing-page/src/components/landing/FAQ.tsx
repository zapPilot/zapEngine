import { MESSAGES } from '@/config/messages';
import { Section } from './primitives/Section';

export function FAQV2() {
  return (
    <Section
      id="faq"
      className="faq-v2"
      innerClassName="faq-inner"
      kicker="FAQ"
      title={MESSAGES.faq.title}
      subtitle={MESSAGES.faq.subtitle}
    >
      <div className="faq-list">
        {MESSAGES.faq.items.map((item) => (
          <details className="faq-item" key={item.question}>
            <summary>
              <span>{item.question}</span>
            </summary>
            <div className="faq-answer">
              <p>{item.answer}</p>
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}
