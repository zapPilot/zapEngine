import { StatusBadge, StatusNote } from '@/components/StatusBadge';
import { MESSAGES } from '@/config/messages';

export function Strategies() {
  const { strategies } = MESSAGES;
  return (
    <section
      id="strategy"
      className="zp-section"
      aria-labelledby="strategy-title"
    >
      <div className="zp-container">
        <p className="zp-kicker">{strategies.kicker}</p>
        <h2 id="strategy-title" className="zp-h2">
          {strategies.title}
        </h2>
        <p className="zp-lede">{strategies.lede}</p>
        <div className="zp-compare-grid">
          {strategies.cards.map((card) => (
            <article key={card.title} className="zp-card">
              <div className="zp-strategy-head">
                <p className="zp-card-kicker">{card.tag}</p>
                <StatusBadge capability={card.capability} />
              </div>
              <h3 className="zp-step-title">{card.title}</h3>
              <p className="zp-step-body">{card.text}</p>
              {'meta' in card ? (
                <p className="zp-strategy-meta">{card.meta}</p>
              ) : null}
              {'notes' in card
                ? card.notes.map((note) => (
                    <p key={note.text} className="zp-strategy-note">
                      <StatusNote note={note} />
                    </p>
                  ))
                : null}
              <a className="zp-strategy-link" href={card.link.href}>
                {card.link.label} <span aria-hidden>→</span>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
