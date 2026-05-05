import { MESSAGES } from '@/config/messages';

export function FAQV2() {
  return (
    <section className="v2-section faq-v2" id="faq">
      <div className="section-inner faq-inner">
        <div className="section-kicker">FAQ</div>
        <div className="section-heading-row">
          <div>
            <h2>{MESSAGES.faq.title}</h2>
            <p>{MESSAGES.faq.subtitle}</p>
          </div>
        </div>

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
      </div>
    </section>
  );
}
