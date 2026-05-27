import { MESSAGES } from '@/config/messages';
import { Section } from '@/components/primitives/Section';

export function FAQ() {
  return (
    <Section
      id="faq"
      className="faq"
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
